import logging
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import Dict, Any, List
from pydantic import BaseModel
from datetime import datetime

from app.models.models import Match, MatchPrediction, User, Team, Group, Stadium, PollaConfig
from app.models.enums import MatchStatus, ConfederationType, MatchStage
from app.services.football_api import football_api
from app.core.config import settings

logger = logging.getLogger(__name__)

class SyncResult(BaseModel):
    updated: int = 0
    created: int = 0
    errors: int = 0

async def calculate_predictions_points(db: AsyncSession, match_id: int, skip_refresh: bool = False) -> None:
    # Obtener el partido y sus predicciones
    match_q = select(Match).where(Match.id == match_id)
    match_res = await db.execute(match_q)
    match_obj = match_res.scalar_one_or_none()
    
    if not match_obj or match_obj.status != MatchStatus.finished:
        return

    home_score = match_obj.home_score
    away_score = match_obj.away_score

    # Fetch config for points
    config_q = select(PollaConfig).limit(1)
    config_res = await db.execute(config_q)
    config = config_res.scalar_one_or_none()
    
    p_exact = config.points_exact_score if config else 3
    p_correct = config.points_correct_result if config else 1

    # Obtener todas las predicciones para este partido
    query = select(MatchPrediction).where(MatchPrediction.match_id == match_id)
    result = await db.execute(query)
    predictions = result.scalars().all()
    
    if not predictions:
        return

    # Mapeo de usuarios para actualización masiva (o al menos reducir consultas)
    user_points_delta = {}
    
    for pred in predictions:
        pred_home = pred.predicted_home_score
        pred_away = pred.predicted_away_score
        
        real_winner = "HOME" if home_score > away_score else "AWAY" if away_score > home_score else "DRAW"
        pred_winner = "HOME" if pred_home > pred_away else "AWAY" if pred_away > pred_home else "DRAW"
        
        is_exact = (pred_home == home_score) and (pred_away == away_score)
        is_correct = (real_winner == pred_winner)
        
        points = 0
        
        # Check if knockout stage
        is_knockout = match_obj.stage != MatchStage.group
        
        if is_knockout:
            real_is_draw = (home_score == away_score)
            pred_is_draw = (pred_home == pred_away)
            
            # Find the actual winner including penalties
            if real_is_draw and match_obj.home_score_penalties is not None and match_obj.away_score_penalties is not None:
                real_winner_id = match_obj.home_team_id if match_obj.home_score_penalties > match_obj.away_score_penalties else match_obj.away_team_id
            else:
                real_winner_id = match_obj.home_team_id if home_score > away_score else match_obj.away_team_id
            
            # User's predicted winner
            if pred_home > pred_away:
                user_predicted_winner_id = match_obj.home_team_id
            elif pred_away > pred_home:
                user_predicted_winner_id = match_obj.away_team_id
            else:
                user_predicted_winner_id = pred.predicted_winner_id
            
            if real_is_draw:
                if is_exact:
                    # Exact draw predicted (120 mins)
                    points = p_exact
                else:
                    if pred_is_draw:
                        # Correct outcome (DRAW) in 120 mins
                        points = p_correct
                    else:
                        # Predicted a team to win in 120m, but it ended in a draw.
                        points = 0
            else:
                if is_exact:
                    points = p_exact
                elif is_correct:
                    points = p_correct
        else:
            # Group stage - Standard calculation
            if is_exact:
                points = p_exact
            elif is_correct:
                points = p_correct
            
        old_points = pred.points_earned or 0
        delta = points - old_points
        
        if delta != 0:
            user_points_delta[pred.user_id] = user_points_delta.get(pred.user_id, 0) + delta
            
        if pred.points_earned != points:
            pred.points_earned = points
        if pred.is_exact_score != is_exact:
            pred.is_exact_score = is_exact
        if pred.is_correct_result != is_correct:
            pred.is_correct_result = is_correct
        
    # Actualizar puntos de usuarios en lote (o al menos agrupados)
    if user_points_delta and not skip_refresh:
        for user_id, delta in user_points_delta.items():
            from sqlalchemy import update
            await db.execute(
                update(User)
                .where(User.id == user_id)
                .values(total_points=User.total_points + delta)
            )
        
    await db.commit()

    if not skip_refresh:
        # ACTUALIZACIÓN DE ESTADÍSTICAS REALES DEL EQUIPO
        # Recalculamos para ambos equipos del partido
        await update_team_stats_from_matches(db, match_obj.home_team_id)
        await update_team_stats_from_matches(db, match_obj.away_team_id)
    
    if not skip_refresh:
        # Refrescar la vista materializada del leaderboard
        try:
            from sqlalchemy import text
            await db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard"))
            await db.commit()
        except Exception as e:
            # Rollback the failed transaction first
            await db.rollback()
            # Si falla el concurrente (ej. no hay índice o primera vez), intentar normal
            try:
                await db.execute(text("REFRESH MATERIALIZED VIEW leaderboard"))
                await db.commit()
            except Exception as e2:
                logger.error(f"Error refreshing leaderboard view: {e2}")

async def update_team_stats_from_matches(db: AsyncSession, team_id: int) -> None:
    """
    Recalcula las estadísticas de un equipo (puntos, GF, GC, etc.) 
    basándose únicamente en los partidos terminados en la base de datos local.
    """
    from app.models.enums import MatchStage, MatchStatus
    from sqlalchemy import or_

    # Buscar todos los partidos terminados de este equipo en fase de grupos
    query = select(Match).where(
        or_(Match.home_team_id == team_id, Match.away_team_id == team_id),
        Match.status == MatchStatus.finished,
        Match.stage == MatchStage.group
    )
    result = await db.execute(query)
    matches = result.scalars().all()

    stats = {
        "pj": 0, "v": 0, "e": 0, "d": 0,
        "gf": 0, "gc": 0, "pts": 0
    }

    for m in matches:
        stats["pj"] += 1
        if m.home_team_id == team_id:
            h, a = m.home_score, m.away_score
            stats["gf"] += h
            stats["gc"] += a
            if h > a:
                stats["v"] += 1
                stats["pts"] += 3
            elif h == a:
                stats["e"] += 1
                stats["pts"] += 1
            else:
                stats["d"] += 1
        else:
            h, a = m.home_score, m.away_score
            stats["gf"] += a
            stats["gc"] += h
            if a > h:
                stats["v"] += 1
                stats["pts"] += 3
            elif a == h:
                stats["e"] += 1
                stats["pts"] += 1
            else:
                stats["d"] += 1

    # Actualizar equipo
    team_q = select(Team).where(Team.id == team_id)
    team_res = await db.execute(team_q)
    team = team_res.scalar_one_or_none()
    
    if team:
        team.partidos_jugados = stats["pj"]
        team.victorias = stats["v"]
        team.empates = stats["e"]
        team.derrotas = stats["d"]
        team.goles_favor = stats["gf"]
        team.goles_contra = stats["gc"]
        team.puntos_fase_grupos = stats["pts"]
        team.diferencia_goles = stats["gf"] - stats["gc"]
        
        await db.commit()

async def recalculate_all_teams_stats(db: AsyncSession) -> None:
    """
    Recalcula las estadísticas de TODOS los equipos basándose en los partidos terminados.
    """
    # Obtener todos los equipos
    teams_q = select(Team)
    teams_res = await db.execute(teams_q)
    teams = teams_res.scalars().all()
    
    for team in teams:
        await update_team_stats_from_matches(db, team.id)
    
    logger.info("Recalculadas estadísticas de todos los equipos satisfactoriamente.")

STAGE_MAPPING = {
    "GROUP_STAGE": MatchStage.group,
    "ROUND_OF_32": MatchStage.round_of_32,
    "LAST_32": MatchStage.round_of_32,
    "ROUND_OF_16": MatchStage.round_of_16,
    "LAST_16": MatchStage.round_of_16,
    "QUARTER_FINALS": MatchStage.quarterfinal,
    "SEMI_FINALS": MatchStage.semifinal,
    "THIRD_PLACE": MatchStage.third_place,
    "FINAL": MatchStage.final
}

OFFICIAL_STADIUMS = {
    "Estadio Azteca": {"city": "Ciudad de México", "country": "México", "capacity": 83264},
    "Estadio Akron": {"city": "Guadalajara", "country": "México", "capacity": 46355},
    "Estadio BBVA": {"city": "Monterrey", "country": "México", "capacity": 51000},
    "BC Place": {"city": "Vancouver", "country": "Canadá", "capacity": 54500},
    "BMO Field": {"city": "Toronto", "country": "Canadá", "capacity": 30000},
    "Mercedes-Benz Stadium": {"city": "Atlanta", "country": "USA", "capacity": 71000},
    "Gillette Stadium": {"city": "Boston", "country": "USA", "capacity": 65878},
    "AT&T Stadium": {"city": "Dallas", "country": "USA", "capacity": 80000},
    "NRG Stadium": {"city": "Houston", "country": "USA", "capacity": 72220},
    "GEHA Field at Arrowhead Stadium": {"city": "Kansas City", "country": "USA", "capacity": 76416},
    "SoFi Stadium": {"city": "Los Angeles", "country": "USA", "capacity": 70240},
    "Hard Rock Stadium": {"city": "Miami", "country": "USA", "capacity": 64767},
    "MetLife Stadium": {"city": "New York/New Jersey", "country": "USA", "capacity": 82500},
    "Lincoln Financial Field": {"city": "Philadelphia", "country": "USA", "capacity": 69796},
    "Levi's Stadium": {"city": "San Francisco Bay Area", "country": "USA", "capacity": 68500},
    "Lumen Field": {"city": "Seattle", "country": "USA", "capacity": 69000},
}

# Mapeo oficial de números de partido a estadios (según calendario FIFA WC 2026)
MATCH_STADIUM_MAPPING = {
    1: "Estadio Azteca", 2: "Estadio Akron", 3: "BMO Field", 4: "SoFi Stadium",
    5: "Estadio BBVA", 6: "NRG Stadium", 7: "Estadio Akron", 8: "Mercedes-Benz Stadium",
    9: "Estadio BBVA", 10: "AT&T Stadium", 11: "GEHA Field at Arrowhead Stadium",
    12: "BC Place", 13: "Hard Rock Stadium", 14: "NRG Stadium", 15: "SoFi Stadium",
    16: "Levi's Stadium", 17: "MetLife Stadium", 18: "GEHA Field at Arrowhead Stadium",
    19: "BMO Field", 20: "Lumen Field", 21: "Mercedes-Benz Stadium", 22: "AT&T Stadium",
    23: "Hard Rock Stadium", 24: "Estadio Azteca", 25: "MetLife Stadium",
    26: "Gillette Stadium", 27: "NRG Stadium", 28: "Estadio BBVA",
    29: "GEHA Field at Arrowhead Stadium", 30: "Levi's Stadium", 31: "BC Place",
    32: "Lumen Field", 33: "BMO Field", 34: "MetLife Stadium", 35: "Mercedes-Benz Stadium",
    36: "Lincoln Financial Field", 37: "AT&T Stadium", 38: "Gillette Stadium",
    39: "Hard Rock Stadium", 40: "Lincoln Financial Field", 41: "Lumen Field",
    42: "Levi's Stadium", 43: "NRG Stadium", 44: "AT&T Stadium",
    45: "GEHA Field at Arrowhead Stadium", 46: "Estadio BBVA", 47: "BC Place",
    48: "SoFi Stadium", 49: "MetLife Stadium", 50: "Gillette Stadium",
    51: "Mercedes-Benz Stadium", 52: "Lumen Field", 53: "Estadio Azteca",
    54: "Estadio BBVA", 55: "NRG Stadium", 56: "AT&T Stadium",
    57: "Lincoln Financial Field", 58: "Hard Rock Stadium", 59: "GEHA Field at Arrowhead Stadium",
    60: "SoFi Stadium", 61: "MetLife Stadium", 62: "Gillette Stadium",
    63: "Lumen Field", 64: "BC Place", 65: "BMO Field", 66: "Estadio Azteca",
    67: "Estadio Akron", 68: "MetLife Stadium", 69: "Gillette Stadium",
    70: "Lincoln Financial Field", 71: "Hard Rock Stadium", 72: "Mercedes-Benz Stadium"
}

async def sync_stadiums(db: AsyncSession) -> SyncResult:
    result = SyncResult()
    for name, info in OFFICIAL_STADIUMS.items():
        stadium_q = select(Stadium).where(Stadium.name == name)
        stadium = (await db.execute(stadium_q)).scalar_one_or_none()
        if not stadium:
            stadium = Stadium(name=name, city=info["city"], country=info["country"], capacity=info.get("capacity", 0))
            db.add(stadium)
            result.created += 1
        else:
            stadium.city = info["city"]
            stadium.country = info["country"]
            stadium.capacity = info.get("capacity", 0)
            result.updated += 1
    await db.commit()
    return result

async def _get_or_create_stadium(db: AsyncSession, venue_name: str, match_number: int = None, stadiums_dict: Dict = None) -> Stadium:
    """Helper to get or create stadium with mapping fallback"""
    # 1. Intentar resolver por número de partido si no hay venue o es genérico
    if (not venue_name or "definir" in venue_name.lower() or venue_name == "Unknown Venue") and match_number in MATCH_STADIUM_MAPPING:
        venue_name = MATCH_STADIUM_MAPPING[match_number]
        logger.info(f"Mapping match #{match_number} to stadium: {venue_name}")

    if not venue_name:
        venue_name = "Estadio por definir"

    # Use in-memory dict lookup if available
    if stadiums_dict is not None and venue_name in stadiums_dict:
        return stadiums_dict[venue_name]

    # 2. Buscar en BD
    result = await db.execute(select(Stadium).where(Stadium.name == venue_name))
    stadium = result.scalar_one_or_none()
    
    if stadium:
        if stadiums_dict is not None:
            stadiums_dict[venue_name] = stadium
        return stadium
    
    # 3. Si no existe, ver si está en nuestra lista oficial
    info = OFFICIAL_STADIUMS.get(venue_name, {"city": "Por definir", "country": "TBD", "capacity": 0})
    
    new_stadium = Stadium(
        name=venue_name,
        city=info["city"],
        country=info["country"],
        capacity=info.get("capacity")
    )
    db.add(new_stadium)
    await db.flush()
    if stadiums_dict is not None:
        stadiums_dict[venue_name] = new_stadium
    return new_stadium

async def sync_matches(db: AsyncSession) -> SyncResult:
    result = SyncResult()
    try:
        data = await football_api.get_all_matches()
        if not data or 'matches' not in data:
            return result
            
        # Merge live matches to get real-time score and status updates
        try:
            live_data = await football_api.get_live_matches()
            if live_data and 'matches' in live_data:
                live_dict = {m['id']: m for m in live_data['matches']}
                for i, match in enumerate(data['matches']):
                    if match['id'] in live_dict:
                        data['matches'][i] = live_dict[match['id']]
        except Exception as e:
            logger.warning(f"Error merging live matches in sync: {e}")
            
        # Merge finished matches to get final scores as soon as they complete
        try:
            finished_data = await football_api.get_finished_matches()
            if finished_data and 'matches' in finished_data:
                finished_dict = {m['id']: m for m in finished_data['matches']}
                for i, match in enumerate(data['matches']):
                    if match['id'] in finished_dict:
                        data['matches'][i] = finished_dict[match['id']]
        except Exception as e:
            logger.warning(f"Error merging finished matches in sync: {e}")

        # Sort matches by date and then by ID to ensure a stable sequence (1-104)
        # This allows us to map venues manually using MATCH_STADIUM_MAPPING
        api_matches = sorted(data['matches'], key=lambda x: (x.get('utcDate', ''), x.get('id', 0)))
            
        # Bulk query existing matches, teams, groups, and stadiums to reduce individual SELECT commands
        db_res = await db.execute(select(Match))
        db_matches = {m.external_match_id: m for m in db_res.scalars().all()}
        
        teams_res = await db.execute(select(Team))
        teams_dict = {t.external_id: t for t in teams_res.scalars().all()}
        
        groups_res = await db.execute(select(Group))
        groups_dict = {g.name: g for g in groups_res.scalars().all()}
        
        stadiums_res = await db.execute(select(Stadium))
        stadiums_dict = {s.name: s for s in stadiums_res.scalars().all()}

        for i, match_data in enumerate(api_matches, 1):
            tournament_match_number = i # Unique match number in tournament (1-104)
            ext_id = match_data['id']
            status_str = match_data['status']
            
            api_status = MatchStatus.scheduled
            if status_str in ["IN_PLAY", "PAUSED", "LIVE"]:
                api_status = MatchStatus.live
            elif status_str == "FINISHED":
                api_status = MatchStatus.finished
            elif status_str == "POSTPONED":
                api_status = MatchStatus.postponed
                
            # If the scheduled time has passed and the match is not finished/postponed,
            # automatically treat it as live.
            from datetime import timezone
            now = datetime.now(timezone.utc)
            match_utc = datetime.fromisoformat(match_data['utcDate'].replace('Z', '+00:00'))
            if api_status == MatchStatus.scheduled and match_utc <= now:
                api_status = MatchStatus.live
                
            score_data = match_data.get('score', {}) or {}
            full_time = score_data.get('fullTime') or {}
            home_score = full_time.get('home')
            away_score = full_time.get('away')
            
            penalties = score_data.get('penalties') or {}
            home_penalties = penalties.get('home')
            away_penalties = penalties.get('away')
            
            if home_score is not None and home_penalties is not None:
                home_score = max(0, home_score - home_penalties)
            if away_score is not None and away_penalties is not None:
                away_score = max(0, away_score - away_penalties)
            
            # Look up match in-memory
            db_match = db_matches.get(ext_id)
            
            if db_match:
                is_db_finished = (db_match.status == MatchStatus.finished or db_match.status == "finished")
                is_api_finished = (api_status == MatchStatus.finished or api_status == "finished")
                
                # Update stadium if venue is available or can be mapped
                venue_name = match_data.get('venue')
                stadium_updated = False
                
                new_stadium = await _get_or_create_stadium(db, venue_name, match_number=tournament_match_number, stadiums_dict=stadiums_dict)
                if db_match.stadium_id != new_stadium.id:
                    db_match.stadium_id = new_stadium.id
                    stadium_updated = True

                # If the match is already marked as finished in our database, do not let the API
                # overwrite its scores or status. This preserves manual admin overrides and also
                # prevents downgrades.
                if is_db_finished:
                    if stadium_updated:
                        await db.commit()
                        result.updated += 1
                    continue

                # Keep database status if it is more advanced than API status
                target_status = api_status
                if db_match.status == MatchStatus.live and api_status == MatchStatus.scheduled:
                    target_status = MatchStatus.live

                # Keep database scores if API scores are None
                target_home_score = home_score if home_score is not None else db_match.home_score
                target_away_score = away_score if away_score is not None else db_match.away_score

                # Default to 0 - 0 if the match is live but scores are still None
                if target_status == MatchStatus.live:
                    if target_home_score is None:
                        target_home_score = 0
                    if target_away_score is None:
                        target_away_score = 0

                # Update
                needs_update = (
                    db_match.home_score != target_home_score or
                    db_match.away_score != target_away_score or
                    db_match.home_score_penalties != home_penalties or
                    db_match.away_score_penalties != away_penalties or
                    db_match.status != target_status or 
                    stadium_updated
                )
                if needs_update:
                    db_match.home_score = target_home_score
                    db_match.away_score = target_away_score
                    db_match.home_score_penalties = home_penalties if home_penalties is not None else db_match.home_score_penalties
                    db_match.away_score_penalties = away_penalties if away_penalties is not None else db_match.away_score_penalties
                    db_match.status = target_status
                    db_match.match_number = tournament_match_number
                    
                    if target_status == MatchStatus.finished and target_home_score is not None and target_away_score is not None:
                        await db.commit()
                        await calculate_predictions_points(db, db_match.id)
                    else:
                        await db.commit()
                        
                    result.updated += 1
            else:
                # Create match
                home_ext_id = match_data.get('homeTeam', {}).get('id')
                away_ext_id = match_data.get('awayTeam', {}).get('id')
                
                if not home_ext_id or not away_ext_id:
                    continue
                    
                # Get teams in-memory
                home_team = teams_dict.get(home_ext_id)
                away_team = teams_dict.get(away_ext_id)
                
                if not home_team or not away_team:
                    continue
                
                # Get or create stadium
                venue_name = match_data.get('venue')
                stadium = await _get_or_create_stadium(db, venue_name, match_number=tournament_match_number, stadiums_dict=stadiums_dict)
                
                # Get group if applicable
                group_id = None
                group_name_full = match_data.get('group')
                if group_name_full:
                    group_letter = group_name_full.split(' ')[-1]
                    if len(group_letter) > 1: group_letter = group_letter[0]
                    group_obj = groups_dict.get(group_letter)
                    if group_obj:
                        group_id = group_obj.id

                # Create the match
                init_home_score = home_score
                init_away_score = away_score
                home_penalties = match_data.get('score', {}).get('penalties', {}).get('home')
                away_penalties = match_data.get('score', {}).get('penalties', {}).get('away')

                if api_status == MatchStatus.live:
                    if init_home_score is None:
                        init_home_score = 0
                    if init_away_score is None:
                        init_away_score = 0

                new_match = Match(
                    external_match_id=ext_id,
                    home_team_id=home_team.id,
                    away_team_id=away_team.id,
                    stadium_id=stadium.id,
                    match_date=datetime.fromisoformat(match_data['utcDate'].replace('Z', '+00:00')),
                    stage=STAGE_MAPPING.get(match_data['stage'], MatchStage.group),
                    group_id=group_id,
                    match_number=tournament_match_number,
                    status=api_status,
                    home_score=init_home_score,
                    away_score=init_away_score,
                    home_score_penalties=home_penalties,
                    away_score_penalties=away_penalties
                )
                db.add(new_match)
                await db.flush() # Flush to get id for local dictionaries
                db_matches[ext_id] = new_match
                result.created += 1
                
        await db.commit()
                
    except Exception as e:
        logger.error(f"Sync error: {e}")
        await db.rollback()
        result.errors += 1
        
    return result

AREA_MAPPING = {
    "Europe": ConfederationType.UEFA,
    "South America": ConfederationType.CONMEBOL,
    "North & Central America": ConfederationType.CONCACAF,
    "Africa": ConfederationType.CAF,
    "Asia": ConfederationType.AFC,
    "Oceania": ConfederationType.OFC
}

async def sync_teams_and_groups(db: AsyncSession) -> SyncResult:
    result = SyncResult()
    try:
        logger.info("Starting teams and groups sync...")
        data = await football_api.get_standings()
        
        if not data or 'standings' not in data:
            logger.warning("No standings data received from API")
            return result
            
        # Prefetch all groups and teams in single queries
        groups_res = await db.execute(select(Group))
        groups_dict = {g.name: g for g in groups_res.scalars().all()}
        
        teams_res = await db.execute(select(Team))
        teams_dict = {t.external_id: t for t in teams_res.scalars().all()}

        for standing in data['standings']:
            if standing.get('type') != 'TOTAL':
                continue
                
            group_name_full = standing.get('group', "")
            if not group_name_full:
                continue
                
            group_letter = group_name_full.split(' ')[-1]
            if len(group_letter) > 1: group_letter = group_letter[0]

            # Look up group in-memory
            group_obj = groups_dict.get(group_letter)
            
            if not group_obj:
                group_obj = Group(name=group_letter)
                db.add(group_obj)
                await db.flush()
                groups_dict[group_letter] = group_obj
            
            for entry in standing.get('table', []):
                team_data = entry.get('team', {})
                ext_id = team_data.get('id')
                if not ext_id: continue
                    
                # Look up team in-memory
                db_team = teams_dict.get(ext_id)
                
                area_name = team_data.get('area', {}).get('name', 'Europe')
                confed = AREA_MAPPING.get(area_name, ConfederationType.UEFA)
                
                if db_team:
                    db_team.partidos_jugados = entry.get('playedGames', 0)
                    db_team.victorias = entry.get('won', 0)
                    db_team.empates = entry.get('draw', 0)
                    db_team.derrotas = entry.get('lost', 0)
                    db_team.goles_favor = entry.get('goalsFor', 0)
                    db_team.goles_contra = entry.get('goalsAgainst', 0)
                    db_team.diferencia_goles = entry.get('goalDifference', 0)
                    db_team.puntos_fase_grupos = entry.get('points', 0)
                    db_team.group_id = group_obj.id
                    db_team.logo_url = team_data.get('crest')
                    result.updated += 1
                else:
                    db_team = Team(
                        external_id=ext_id,
                        name=team_data.get('name'),
                        country_code=team_data.get('tla', '??')[:2],
                        confederation=confed,
                        group_id=group_obj.id,
                        logo_url=team_data.get('crest'),
                        partidos_jugados=entry.get('playedGames', 0),
                        victorias=entry.get('won', 0),
                        empates=entry.get('draw', 0),
                        derrotas=entry.get('lost', 0),
                        goles_favor=entry.get('goalsFor', 0),
                        goles_contra=entry.get('goalsAgainst', 0),
                        diferencia_goles=entry.get('goalDifference', 0),
                        puntos_fase_grupos=entry.get('points', 0)
                    )
                    db.add(db_team)
                    await db.flush()
                    teams_dict[ext_id] = db_team
                    result.created += 1

        await db.commit()
    except Exception as e:
        logger.error(f"Error syncing teams and groups: {e}")
        await db.rollback()
        result.errors += 1
    return result

async def sync_special_categories(db: AsyncSession) -> None:
    """Sincroniza las categorías de apuestas especiales con sus puntos."""
    from app.models.models import SpecialBetCategory
    from app.models.enums import BetType
    from datetime import datetime, timezone

    categories = [
        {"name": "Campeón", "description": "Selecciona el equipo que quedará campeón del Mundial 2026", "points": 30, "type": BetType.team},
        {"name": "Subcampeón", "description": "Selecciona el equipo que perderá la final", "points": 20, "type": BetType.team},
        {"name": "Tercer lugar", "description": "Selecciona el equipo que quedará en tercer lugar", "points": 15, "type": BetType.team},
        {"name": "Mejor jugador del torneo", "description": "Escribe quién será el Balón de Oro del Mundial", "points": 20, "type": BetType.text},
        {"name": "Goleador del torneo", "description": "Escribe quién ganará la Bota de Oro", "points": 20, "type": BetType.text},
        {"name": "Mejor portero del torneo", "description": "Escribe el portero con menos goles recibidos (Guante de Oro)", "points": 20, "type": BetType.text},
    ]

    deadline = datetime(2026, 6, 11, 15, 0, tzinfo=timezone.utc) # Fecha de inicio del mundial

    for cat in categories:
        stmt = select(SpecialBetCategory).where(SpecialBetCategory.name == cat["name"])
        existing = (await db.execute(stmt)).scalar_one_or_none()
        
        if existing:
            existing.points_reward = cat["points"]
            existing.description = cat["description"]
            existing.bet_type = cat["type"]
            existing.deadline = deadline
        else:
            new_cat = SpecialBetCategory(
                name=cat["name"],
                description=cat["description"],
                points_reward=cat["points"],
                bet_type=cat["type"],
                deadline=deadline
            )
            db.add(new_cat)
    
    await db.commit()

async def sync_players(db: AsyncSession) -> SyncResult:
    """Sincroniza los jugadores de todos los equipos registrados."""
    from app.models.models import Player, PlayerTournamentStats
    from app.models.enums import PlayerPosition
    result = SyncResult()
    
    # Obtener todos los equipos que tengan ID externo
    teams_q = select(Team).where(Team.external_id.is_not(None))
    teams = (await db.execute(teams_q)).scalars().all()
    
    # Prefetch all players of all teams in a single database query to avoid 1200+ queries
    players_res = await db.execute(select(Player))
    players_dict = {(p.name, p.team_id): p for p in players_res.scalars().all()}
    
    for team in teams:
        try:
            logger.info(f"Sincronizando jugadores de {team.name}...")
            squad_data = await football_api.get_team_squad(team.external_id)
            
            if not squad_data or "squad" not in squad_data:
                logger.warning(f"No se encontró squad para {team.name}")
                continue
                
            for p_data in squad_data["squad"]:
                # Look up player in-memory
                player_key = (p_data["name"], team.id)
                player = players_dict.get(player_key)
                
                pos_map = {
                    "Goalkeeper": PlayerPosition.goalkeeper,
                    "Defender": PlayerPosition.defender,
                    "Defence": PlayerPosition.defender,
                    "Midfielder": PlayerPosition.midfielder,
                    "Midfield": PlayerPosition.midfielder,
                    "Forward": PlayerPosition.forward,
                    "Offence": PlayerPosition.forward
                }
                pos = pos_map.get(p_data.get("position"), PlayerPosition.midfielder)
                
                if player:
                    player.shirt_number = p_data.get("shirtNumber")
                    player.position = pos
                    result.updated += 1
                else:
                    player = Player(
                        team_id=team.id,
                        name=p_data["name"],
                        shirt_number=p_data.get("shirtNumber"),
                        position=pos,
                        nationality=p_data.get("nationality")
                    )
                    db.add(player)
                    await db.flush() # Para obtener el ID del jugador recién creado
                    players_dict[player_key] = player
                    
                    # Inicializar estadísticas del torneo para el jugador
                    stats = PlayerTournamentStats(player_id=player.id)
                    db.add(stats)
                    result.created += 1
            
            await db.commit()
            # Pequeño delay para no saturar la API (Rate limit)
            await asyncio.sleep(0.5)
            
        except Exception as e:
            logger.error(f"Error sincronizando equipo {team.name}: {e}")
            result.errors += 1
            
    return result

async def sync_scorers(db: AsyncSession) -> SyncResult:
    """Sincroniza los goleadores del torneo."""
    from app.models.models import Player, PlayerTournamentStats
    result = SyncResult()
    
    try:
        scorers_data = await football_api.get_scorers()
        if not scorers_data or "scorers" not in scorers_data:
            return result
            
        # Collect all scorer names from API response
        scorer_names = [s_data["player"]["name"] for s_data in scorers_data["scorers"] if s_data.get("player", {}).get("name")]
        
        if not scorer_names:
            return result
            
        # Bulk query players by name
        players_res = await db.execute(select(Player).where(Player.name.in_(scorer_names)))
        players_dict = {p.name: p for p in players_res.scalars().all()}
        
        # Bulk query stats for these players
        player_ids = [p.id for p in players_dict.values()]
        stats_dict = {}
        if player_ids:
            stats_res = await db.execute(select(PlayerTournamentStats).where(PlayerTournamentStats.player_id.in_(player_ids)))
            stats_dict = {s.player_id: s for s in stats_res.scalars().all()}
            
        for s_data in scorers_data["scorers"]:
            player_name = s_data["player"]["name"]
            
            # Look up player in-memory
            player = players_dict.get(player_name)
            
            if player:
                # Look up stats in-memory
                stats = stats_dict.get(player.id)
                
                if stats:
                    stats.goals = s_data.get("goals", 0)
                    stats.assists = s_data.get("assists", 0)
                    result.updated += 1
                    
        await db.commit()
    except Exception as e:
        logger.error(f"Error sincronizando goleadores: {e}")
        result.errors += 1
        
    return result

async def sync_standings(db: AsyncSession) -> SyncResult:
    res1 = await sync_stadiums(db)
    res2 = await sync_teams_and_groups(db)
    
    # Después de sincronizar equipos y grupos, recalculamos localmente 
    # para asegurar que los puntos coincidan con los partidos que tenemos en la DB
    await recalculate_all_teams_stats(db)
    
    await sync_special_categories(db)
    res3 = await sync_scorers(db) # Añadimos goleadores al sync general
    
    return SyncResult(
        updated=res1.updated + res2.updated + res3.updated,
        created=res1.created + res2.created + res3.created,
        errors=res1.errors + res2.errors + res3.errors
    )

async def recalculate_all_user_points(db: AsyncSession) -> SyncResult:
    from sqlalchemy import select, func
    from app.models.models import User, MatchPrediction, UserBracket, SpecialBetAnswer, Match
    from app.models.enums import MatchStatus
    from sqlalchemy import text
    import logging
    logger = logging.getLogger(__name__)

    # Primero recalculamos los puntos ganados para cada predicción basada en los resultados reales de los partidos terminados
    finished_matches = (await db.execute(select(Match.id).where(Match.status == MatchStatus.finished))).scalars().all()
    for match_id in finished_matches:
        await calculate_predictions_points(db, match_id, skip_refresh=True)
        db.expunge_all()

    # Execute group by queries to get sums for all users in just 3 queries
    mp_res = await db.execute(select(MatchPrediction.user_id, func.sum(MatchPrediction.points_earned)).group_by(MatchPrediction.user_id))
    mp_dict = {row[0]: row[1] or 0 for row in mp_res.all()}
    
    ub_res = await db.execute(select(UserBracket.user_id, func.sum(UserBracket.points_earned)).group_by(UserBracket.user_id))
    ub_dict = {row[0]: row[1] or 0 for row in ub_res.all()}
    
    sb_res = await db.execute(select(SpecialBetAnswer.user_id, func.sum(SpecialBetAnswer.points_earned)).group_by(SpecialBetAnswer.user_id))
    sb_dict = {row[0]: row[1] or 0 for row in sb_res.all()}
    
    users = (await db.execute(select(User))).scalars().all()
    updated = 0
    for u in users:
        mp_pts = mp_dict.get(u.id, 0)
        ub_pts = ub_dict.get(u.id, 0)
        sb_pts = sb_dict.get(u.id, 0)
        
        total = mp_pts + ub_pts + sb_pts
        if u.total_points != total:
            u.total_points = total
            updated += 1
    
    await db.commit()
    
    # Refresh materialized view
    try:
        await db.execute(text('REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard'))
        await db.commit()
    except Exception as e:
        await db.rollback()
        try:
            await db.execute(text('REFRESH MATERIALIZED VIEW leaderboard'))
            await db.commit()
        except Exception as e2:
            logger.error(f'Error refreshing leaderboard view: {e2}')
            
    return SyncResult(updated=updated, created=0, errors=0)

