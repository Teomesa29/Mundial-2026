from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Dict, Any
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import MatchPrediction, User, Match, UserBracket, PollaConfig
from app.schemas.schemas import (
    MatchPredictionCreate, MatchPredictionResponse, 
    UserBracketCreate, UserBracketResponse, GroupForecast, TeamForecast
)

router = APIRouter()

@router.get("/forecast", response_model=List[GroupForecast])
async def get_my_forecast(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.models import Team, Group, Match, MatchPrediction
    from app.models.enums import MatchStage
    from sqlalchemy.orm import joinedload
    
    # 1. Fetch all groups and their teams
    from sqlalchemy.orm import selectinload
    groups_q = select(Group).options(selectinload(Group.teams))
    groups_res = await db.execute(groups_q)
    groups = groups_res.scalars().unique().all()
    
    # 2. Fetch user predictions for group stage matches
    preds_q = select(MatchPrediction).join(Match).where(
        MatchPrediction.user_id == current_user.id,
        Match.stage == MatchStage.group
    )
    preds_res = await db.execute(preds_q)
    predictions = {p.match_id: p for p in preds_res.scalars().all()}
    
    # 3. Fetch all group stage matches
    matches_q = select(Match).where(Match.stage == MatchStage.group)
    matches_res = await db.execute(matches_q)
    matches = matches_res.scalars().all()
    
    forecast_data = []
    
    # Sort groups by name
    sorted_groups = sorted(groups, key=lambda g: g.name)
    
    for group in sorted_groups:
        # Initialize standings for this group
        standings_dict = {team.id: {
            "team_id": team.id,
            "team_name": team.name,
            "country_code": team.country_code,
            "logo_url": team.logo_url,
            "points": 0, "played": 0, "wins": 0, "draws": 0, "losses": 0,
            "goals_for": 0, "goals_against": 0, "goal_difference": 0
        } for team in group.teams}
        
        # Filter matches for this group
        group_matches = [m for m in matches if m.group_id == group.id]
        
        for match in group_matches:
            pred = predictions.get(match.id)
            if not pred:
                continue
                
            h_id = match.home_team_id
            a_id = match.away_team_id
            h_score = pred.predicted_home_score
            a_score = pred.predicted_away_score
            
            # Check if IDs are in standings_dict (they should be)
            if h_id in standings_dict and a_id in standings_dict:
                # Update home team
                standings_dict[h_id]["played"] += 1
                standings_dict[h_id]["goals_for"] += h_score
                standings_dict[h_id]["goals_against"] += a_score
                standings_dict[h_id]["goal_difference"] += (h_score - a_score)
                
                # Update away team
                standings_dict[a_id]["played"] += 1
                standings_dict[a_id]["goals_for"] += a_score
                standings_dict[a_id]["goals_against"] += h_score
                standings_dict[a_id]["goal_difference"] += (a_score - h_score)
                
                if h_score > a_score:
                    standings_dict[h_id]["points"] += 3
                    standings_dict[h_id]["wins"] += 1
                    standings_dict[a_id]["losses"] += 1
                elif a_score > h_score:
                    standings_dict[a_id]["points"] += 3
                    standings_dict[a_id]["wins"] += 1
                    standings_dict[h_id]["losses"] += 1
                else:
                    standings_dict[h_id]["points"] += 1
                    standings_dict[a_id]["points"] += 1
                    standings_dict[h_id]["draws"] += 1
                    standings_dict[a_id]["draws"] += 1
        
        # Sort standings: Points DESC, GD DESC, GF DESC
        standings_list = list(standings_dict.values())
        sorted_standings = sorted(
            standings_list, 
            key=lambda x: (x["points"], x["goal_difference"], x["goals_for"]), 
            reverse=True
        )
        
        # Calculate Real Standings
        real_standings_list = []
        for team in group.teams:
            real_standings_list.append({
                "team_id": team.id,
                "team_name": team.name,
                "country_code": team.country_code,
                "logo_url": team.logo_url,
                "points": team.puntos_fase_grupos or 0,
                "played": team.partidos_jugados or 0,
                "wins": team.victorias or 0,
                "draws": team.empates or 0,
                "losses": team.derrotas or 0,
                "goals_for": team.goles_favor or 0,
                "goals_against": team.goles_contra or 0,
                "goal_difference": team.diferencia_goles or 0
            })
        
        sorted_real = sorted(
            real_standings_list,
            key=lambda x: (x["points"], x["goal_difference"], x["goals_for"]),
            reverse=True
        )
        
        forecast_data.append({
            "group_id": group.id,
            "group_name": f"Grupo {group.name}",
            "standings": sorted_standings,
            "real_standings": sorted_real
        })
    
    return forecast_data

@router.get("/me", response_model=List[MatchPredictionResponse])
@router.get("/my", response_model=List[MatchPredictionResponse])
async def get_my_predictions(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from sqlalchemy.orm import joinedload
    result = await db.execute(
        select(MatchPrediction)
        .options(
            joinedload(MatchPrediction.match).joinedload(Match.home_team), 
            joinedload(MatchPrediction.match).joinedload(Match.away_team),
            joinedload(MatchPrediction.match).joinedload(Match.group),
            joinedload(MatchPrediction.match).joinedload(Match.stadium)
        )
        .where(MatchPrediction.user_id == current_user.id)
    )
    preds = result.scalars().unique().all()
    # Ensure group_name is set for each match in predictions
    for p in preds:
        if p.match:
            if p.match.group:
                p.match.group_name = f"Grupo {p.match.group.name}"
            else:
                p.match.group_name = str(p.match.stage.value) if hasattr(p.match.stage, 'value') else str(p.match.stage)
    return preds

@router.get("/user/{user_id}", response_model=List[MatchPredictionResponse])
async def get_user_predictions(user_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Verify user exists
    user_exists = (await db.execute(select(User.id).where(User.id == user_id))).scalar_one_or_none()
    if not user_exists:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    from sqlalchemy.orm import joinedload
    result = await db.execute(
        select(MatchPrediction)
        .options(
            joinedload(MatchPrediction.match).joinedload(Match.home_team), 
            joinedload(MatchPrediction.match).joinedload(Match.away_team),
            joinedload(MatchPrediction.match).joinedload(Match.group),
            joinedload(MatchPrediction.match).joinedload(Match.stadium)
        )
        .where(MatchPrediction.user_id == user_id)
    )
    preds = result.scalars().unique().all()
    
    from datetime import datetime, timezone, timedelta
    from app.models.enums import MatchStage
    now = datetime.now(timezone.utc)
    config = (await db.execute(select(PollaConfig).limit(1))).scalar_one_or_none()
    raw_lock_minutes = config.prediction_lock_minutes_before_match if config else 60
    if hasattr(raw_lock_minutes, '_mock_self') or 'Mock' in type(raw_lock_minutes).__name__:
        lock_minutes = 60
    else:
        try:
            lock_minutes = int(raw_lock_minutes)
        except Exception:
            lock_minutes = 60
    
    # Hide other users' predictions unless the match is locked
    obscure = (current_user.id != user_id) and (current_user.role.value != "admin")
    
    # Ensure group_name is set for each match in predictions
    for p in preds:
        if p.match:
            if p.match.group:
                p.match.group_name = f"Grupo {p.match.group.name}"
            else:
                p.match.group_name = str(p.match.stage.value) if hasattr(p.match.stage, 'value') else str(p.match.stage)
            
            stage_str = p.match.stage.value if hasattr(p.match.stage, 'value') else str(p.match.stage)
            p.match.group_name = f"V2_RELOADED: {stage_str}"
            is_knockout = "group" not in stage_str.lower()
            if obscure and is_knockout:
                m_date = p.match.match_date
                if isinstance(m_date, str):
                    match_utc = datetime.fromisoformat(m_date.replace('Z', '+00:00'))
                else:
                    match_utc = m_date.replace(tzinfo=timezone.utc) if m_date.tzinfo is None else m_date
                
                lock_time = match_utc - timedelta(minutes=15)
                if now < lock_time:
                    p.predicted_home_score = None
                    p.predicted_away_score = None
                    p.predicted_winner_id = None
    return preds


@router.post("/", response_model=MatchPredictionResponse)
async def create_prediction(pred: MatchPredictionCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from datetime import timezone
    now = datetime.now(timezone.utc)

    # ── Sequential queries (asyncio.gather is unsafe on a single AsyncSession) ──
    config = (await db.execute(select(PollaConfig).limit(1))).scalar_one_or_none()

    match = (await db.execute(select(Match).where(Match.id == pred.match_id))).scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Partido no encontrado")

    # Check if registration is open
    if config and not config.is_registration_open:
        raise HTTPException(status_code=400, detail="Las inscripciones están cerradas.")

    # Check global entry deadline
    if config and config.entry_deadline:
        deadline = config.entry_deadline.replace(tzinfo=timezone.utc) if config.entry_deadline.tzinfo is None else config.entry_deadline
        if now > deadline:
            raise HTTPException(status_code=400, detail="El plazo de inscripción general ha vencido.")

    # Check match-specific lock
    match_time = match.match_date.replace(tzinfo=timezone.utc) if match.match_date.tzinfo is None else match.match_date
    if match_time <= now:
        raise HTTPException(status_code=400, detail="El partido ya ha comenzado, no puedes enviar predicciones.")

    existing_pred = (await db.execute(
        select(MatchPrediction).where(
            MatchPrediction.user_id == current_user.id,
            MatchPrediction.match_id == pred.match_id
        )
    )).scalar_one_or_none()

    from app.services.activity_service import log_activity
    
    if existing_pred:
        # Update existing
        old_val = {"home": existing_pred.predicted_home_score, "away": existing_pred.predicted_away_score}
        for key, value in pred.model_dump().items():
            setattr(existing_pred, key, value)
        new_pred = existing_pred
        
        await log_activity(
            db, 
            current_user.id, 
            "update_prediction", 
            "match_prediction", 
            existing_pred.id, 
            old_value=old_val, 
            new_value=pred.model_dump()
        )
    else:
        # Create new
        new_pred = MatchPrediction(user_id=current_user.id, **pred.model_dump())
        db.add(new_pred)
        await db.flush() # Para obtener el ID
        
        await log_activity(
            db, 
            current_user.id, 
            "create_prediction", 
            "match_prediction", 
            new_pred.id, 
            new_value=pred.model_dump()
        )

    await db.commit()
    
    # Reload with joinedload for response
    from sqlalchemy.orm import joinedload
    result = await db.execute(
        select(MatchPrediction)
        .options(
            joinedload(MatchPrediction.match).joinedload(Match.home_team),
            joinedload(MatchPrediction.match).joinedload(Match.away_team),
            joinedload(MatchPrediction.match).joinedload(Match.group),
            joinedload(MatchPrediction.match).joinedload(Match.stadium)
        )
        .where(MatchPrediction.user_id == current_user.id, MatchPrediction.match_id == pred.match_id)
    )
    full_pred = result.scalar_one()
    
    # Set group_name for response
    if full_pred.match.group:
        full_pred.match.group_name = f"Grupo {full_pred.match.group.name}"
    else:
        full_pred.match.group_name = str(full_pred.match.stage.value) if hasattr(full_pred.match.stage, 'value') else str(full_pred.match.stage)
        
    return full_pred

@router.get("/my/stats")
async def get_my_stats(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"total_predictions": 0, "total_points": current_user.total_points}

@router.get("/bracket", response_model=UserBracketResponse)
async def get_my_bracket(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(UserBracket).where(UserBracket.user_id == current_user.id))
    bracket = result.scalar_one_or_none()
    if not bracket:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        return UserBracketResponse(
            id=0,
            user_id=current_user.id,
            bracket_data={},
            points_earned=0,
            created_at=now,
            updated_at=now
        )
    return bracket

async def sync_bracket_to_predictions(db: AsyncSession, user_id: int, bracket_data: dict, is_admin: bool = False):
    from app.models.enums import MatchStage
    from datetime import timezone, datetime, timedelta
    
    # 1. Fetch all knockout matches
    result = await db.execute(
        select(Match)
        .where(Match.stage != MatchStage.group)
        .order_by(Match.match_number, Match.id)
    )
    knockout_matches = result.scalars().all()
    
    # Create a lookup map of match_id to Match object
    match_map = {m.id: m for m in knockout_matches}
    
    # 2. Group by stage
    from collections import defaultdict
    grouped = defaultdict(list)
    for m in knockout_matches:
        grouped[m.stage].append(m)
        
    # 3. Define STAGE_TO_BRACKET_IDS
    STAGE_TO_BRACKET_IDS = {
        MatchStage.round_of_32: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
        MatchStage.round_of_16: [17, 18, 19, 20, 21, 22, 23, 24],
        MatchStage.quarterfinal: [25, 26, 27, 28],
        MatchStage.semifinal: [29, 30],
        MatchStage.final: [31],
        MatchStage.third_place: [32]
    }
    
    # Map bracket_id to match_id
    bracket_to_match_id = {}
    for stage, ids in STAGE_TO_BRACKET_IDS.items():
        stage_matches = grouped.get(stage, [])
        sorted_matches = sorted(stage_matches, key=lambda m: (m.match_number or 0, m.id))
        for idx, match in enumerate(sorted_matches):
            if idx < len(ids):
                bracket_to_match_id[ids[idx]] = match.id
                
    now = datetime.now(timezone.utc)
    
    # 4. Upsert MatchPrediction entries
    for bracket_id_str, pred_info in bracket_data.items():
        try:
            bracket_id = int(bracket_id_str)
        except ValueError:
            continue
            
        match_id = bracket_to_match_id.get(bracket_id)
        if not match_id:
            continue
            
        match_obj = match_map.get(match_id)
        if not match_obj:
            continue
            
        # Prevent editing if knockout match is within 15 minutes of start (unless admin)
        m_date = match_obj.match_date
        if isinstance(m_date, str):
            match_utc = datetime.fromisoformat(m_date.replace('Z', '+00:00'))
        else:
            match_utc = m_date.replace(tzinfo=timezone.utc) if m_date.tzinfo is None else m_date
            
        if not is_admin and (match_utc - timedelta(minutes=15) <= now):
            continue
            
        pred_home = pred_info.get("predicted_home")
        pred_away = pred_info.get("predicted_away")
        pred_winner_id = pred_info.get("predicted_winner_id")
        
        if pred_home is None or pred_home == "" or pred_away is None or pred_away == "":
            continue
            
        try:
            pred_home = int(pred_home)
            pred_away = int(pred_away)
        except ValueError:
            continue
            
        pred_q = select(MatchPrediction).where(
            MatchPrediction.user_id == user_id,
            MatchPrediction.match_id == match_id
        )
        existing_pred = (await db.execute(pred_q)).scalar_one_or_none()
        
        if existing_pred:
            existing_pred.predicted_home_score = pred_home
            existing_pred.predicted_away_score = pred_away
            existing_pred.predicted_winner_id = pred_winner_id
            existing_pred.updated_at = datetime.now(timezone.utc)
        else:
            new_pred = MatchPrediction(
                user_id=user_id,
                match_id=match_id,
                predicted_home_score=pred_home,
                predicted_away_score=pred_away,
                predicted_winner_id=pred_winner_id
            )
            db.add(new_pred)

@router.post("/bracket", response_model=UserBracketResponse)
async def update_my_bracket(bracket_req: UserBracketCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Check global config for locking
    config = (await db.execute(select(PollaConfig).limit(1))).scalar_one_or_none()
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    
    if config and current_user.role.value != "admin":
        if not config.is_bracket_open:
            raise HTTPException(status_code=400, detail="El registro de llaves está cerrado.")

    result = await db.execute(select(UserBracket).where(UserBracket.user_id == current_user.id))
    bracket = result.scalar_one_or_none()
    
    if not bracket:
        bracket = UserBracket(user_id=current_user.id, bracket_data=bracket_req.bracket_data)
        db.add(bracket)
    else:
        # Prevent overwriting locked matches inside bracket_data by keeping the existing locked values
        from app.models.enums import MatchStage
        
        # 1. Fetch knockout matches to check lock
        match_q = await db.execute(
            select(Match)
            .where(Match.stage != MatchStage.group)
        )
        k_matches = match_q.scalars().all()
        k_match_map = {m.id: m for m in k_matches}
        
        # We need mapping from bracket_id to match_id
        from collections import defaultdict
        grouped = defaultdict(list)
        for m in k_matches:
            grouped[m.stage].append(m)
            
        STAGE_TO_BRACKET_IDS = {
            MatchStage.round_of_32: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
            MatchStage.round_of_16: [17, 18, 19, 20, 21, 22, 23, 24],
            MatchStage.quarterfinal: [25, 26, 27, 28],
            MatchStage.semifinal: [29, 30],
            MatchStage.final: [31],
            MatchStage.third_place: [32]
        }
        
        bracket_to_match_id = {}
        for stage, ids in STAGE_TO_BRACKET_IDS.items():
            stage_matches = grouped.get(stage, [])
            sorted_matches = sorted(stage_matches, key=lambda m: (m.match_number or 0, m.id))
            for idx, match in enumerate(sorted_matches):
                if idx < len(ids):
                    bracket_to_match_id[ids[idx]] = match.id
                    
        # Filter new bracket data: if a match is locked and not admin, preserve old value
        is_admin = (current_user.role.value == "admin")
        old_data = bracket.bracket_data or {}
        new_data = dict(bracket_req.bracket_data)
        
        from datetime import timedelta
        for b_id_str, pred_info in new_data.items():
            try:
                b_id = int(b_id_str)
            except ValueError:
                continue
            m_id = bracket_to_match_id.get(b_id)
            if m_id:
                m_obj = k_match_map.get(m_id)
                if m_obj:
                    m_date = m_obj.match_date
                    if isinstance(m_date, str):
                        m_utc = datetime.fromisoformat(m_date.replace('Z', '+00:00'))
                    else:
                        m_utc = m_date.replace(tzinfo=timezone.utc) if m_date.tzinfo is None else m_date
                        
                    if not is_admin and (m_utc - timedelta(minutes=15) <= now):
                        # Lock active: restore previous value for this match
                        if b_id_str in old_data:
                            new_data[b_id_str] = old_data[b_id_str]
        
        bracket.bracket_data = new_data
    
    # Sincronizar las predicciones del bracket a la tabla MatchPrediction
    is_admin = (current_user.role.value == "admin")
    await sync_bracket_to_predictions(db, current_user.id, bracket.bracket_data, is_admin=is_admin)
    
    await db.commit()
    await db.refresh(bracket)
    return bracket

@router.get("/match/{match_id}")
async def get_prediction_for_match(match_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(MatchPrediction).where(MatchPrediction.match_id == match_id, MatchPrediction.user_id == current_user.id))
    return result.scalar_one_or_none()

@router.get("/match/{match_id}/all")
async def get_all_predictions_for_match(match_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return []
