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

@router.post("/bracket", response_model=UserBracketResponse)
async def update_my_bracket(bracket_req: UserBracketCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Check global config for locking
    config = (await db.execute(select(PollaConfig).limit(1))).scalar_one_or_none()
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    
    if config and current_user.role.value != "admin":
        if not config.is_bracket_open:
            raise HTTPException(status_code=400, detail="El registro de llaves está cerrado.")
        if config.entry_deadline:
            deadline = config.entry_deadline.replace(tzinfo=timezone.utc) if config.entry_deadline.tzinfo is None else config.entry_deadline
            if now > deadline:
                raise HTTPException(status_code=400, detail="El plazo de inscripción general ha vencido.")

    result = await db.execute(select(UserBracket).where(UserBracket.user_id == current_user.id))
    bracket = result.scalar_one_or_none()
    
    if not bracket:
        bracket = UserBracket(user_id=current_user.id, bracket_data=bracket_req.bracket_data)
        db.add(bracket)
    else:
        bracket.bracket_data = bracket_req.bracket_data
    
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
