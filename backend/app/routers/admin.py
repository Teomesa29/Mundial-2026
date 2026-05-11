from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.core.database import get_db
from app.core.deps import get_current_admin, get_current_user
from app.core.security import hash_password
from app.models.models import User, Match, PollaConfig
from app.models.enums import UserRole
from app.schemas.schemas import AdminCreateUser, UserResponse, PollaConfigResponse, PollaConfigUpdate
from app.services.sync_service import sync_matches, sync_scorers, sync_standings
from app.services.activity_service import prune_old_logs, log_activity
import re

router = APIRouter(dependencies=[Depends(get_current_admin)])

# ── Helpers ──────────────────────────────────────────────────────────────────

def _email_to_username(email: str) -> str:
    """Genera un username limpio a partir del prefijo del email."""
    prefix = email.split("@")[0]
    return re.sub(r"[^a-z0-9_]", "_", prefix.lower())[:50]

# ── Dashboard ─────────────────────────────────────────────────────────────────

import asyncio
from fastapi import BackgroundTasks

@router.get("/dashboard")
async def get_dashboard(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import func
    from app.models.models import MatchPrediction

    # Sequential queries — asyncio.gather is unsafe on a single AsyncSession
    total_users       = (await db.execute(select(func.count(User.id)))).scalar_one()
    total_predictions = (await db.execute(select(func.count(MatchPrediction.id)))).scalar_one()

    # Prune old logs in the background — response returns immediately
    background_tasks.add_task(prune_old_logs, db, 7)

    return {
        "total_users": total_users,
        "total_predictions": total_predictions,
        "matches_pending_update": 0,
        "last_sync_at": None,
        "points_distributed_today": 0,
    }

# ── Sync ──────────────────────────────────────────────────────────────────────

@router.post("/sync")
async def trigger_sync(db: AsyncSession = Depends(get_db)):
    result = await sync_matches(db)
    return result

@router.post("/sync/standings")
async def trigger_standings_sync(db: AsyncSession = Depends(get_db)):
    """Sincroniza grupos y equipos"""
    await sync_standings(db)
    return {"status": "success", "message": "Sincronización de grupos y equipos completada"}

@router.post("/sync/stadiums")
async def trigger_stadiums_sync(db: AsyncSession = Depends(get_db)):
    """Sincroniza estadios oficiales"""
    from app.services.sync_service import sync_stadiums
    result = await sync_stadiums(db)
    return {"status": "success", "data": result}

@router.patch("/matches/{match_id}")
async def update_match_result(
    match_id: int,
    match_update: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
        
    result = await db.execute(select(Match).where(Match.id == match_id))
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    from app.models.enums import MatchStatus
    from app.services.sync_service import calculate_predictions_points

    old_score = {"home": match.home_score, "away": match.away_score, "status": match.status}
    
    for key, value in match_update.items():
        if hasattr(match, key):
            setattr(match, key, value)
    
    await log_activity(
        db, 
        current_user.id, 
        "update_match", 
        "match", 
        match.id, 
        old_value=old_score, 
        new_value=match_update
    )
    
    await db.commit()
    
    from app.models.enums import MatchStage
    from app.services.sync_service import update_team_stats_from_matches

    if match.status == MatchStatus.finished:
        await calculate_predictions_points(db, match.id)
        
    if match.stage == MatchStage.group:
        await update_team_stats_from_matches(db, match.home_team_id)
        await update_team_stats_from_matches(db, match.away_team_id)

    return {"status": "success", "match_id": match_id}

@router.post("/sync/scorers")
async def trigger_sync_scorers(db: AsyncSession = Depends(get_db)):
    await sync_scorers(db)
    return {"status": "ok"}

# ── Matches ───────────────────────────────────────────────────────────────────

@router.get("/matches")
async def get_admin_matches(db: AsyncSession = Depends(get_db)):
    return []

@router.put("/matches/{id}")
async def update_match_manually(id: int, db: AsyncSession = Depends(get_db)):
    return {"status": "ok"}

@router.post("/matches/{id}/recalculate")
async def recalculate_match(id: int, db: AsyncSession = Depends(get_db)):
    return {"status": "ok"}

# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserResponse])
async def get_admin_users(db: AsyncSession = Depends(get_db)):
    """Retorna la lista completa de usuarios."""
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return result.scalars().all()


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    body: AdminCreateUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Crea un nuevo usuario. Solo admins pueden hacerlo.
    Solo se requieren **email** y **contraseña**.
    El username se autogenera a partir del email si no se provee display_name.
    """
    # Verificar que el email no exista
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un usuario con el correo {body.email}",
        )

    # Generar username base y hacerlo único si ya existe de forma eficiente
    base_username = _email_to_username(body.email)
    
    # Buscar todos los usernames similares de una sola vez
    stmt = select(User.username).where(User.username.like(f"{base_username}%"))
    result = await db.execute(stmt)
    existing_usernames = set(result.scalars().all())
    
    username = base_username
    suffix = 1
    while username in existing_usernames:
        username = f"{base_username}_{suffix}"
        suffix += 1

    new_user = User(
        email=body.email,
        username=username,
        hashed_password=hash_password(body.password),
        display_name=body.display_name or username,
        role=body.role,
        is_active=True,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    # Refresh the leaderboard so the new user appears at the bottom
    from sqlalchemy import text
    try:
        await db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard"))
        await db.commit()
    except Exception:
        await db.rollback()
        await db.execute(text("REFRESH MATERIALIZED VIEW leaderboard"))
        await db.commit()
        
    return new_user


@router.get("/users", response_model=List[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
):
    """Lista todos los usuarios (solo admin)."""
    result = await db.execute(select(User).order_by(User.id))
    return result.scalars().all()

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Elimina un usuario (solo admin)."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    try:
        await db.delete(user)
        await db.commit()
        
        # Refresh the materialized view so the deleted user disappears from the ranking
        from sqlalchemy import text
        try:
            await db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard"))
            await db.commit()
        except Exception:
            # Fallback for concurrent refresh failure or if unique index is missing
            await db.rollback()
            await db.execute(text("REFRESH MATERIALIZED VIEW leaderboard"))
            await db.commit()
            
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"No se pudo eliminar el usuario debido a restricciones de la base de datos o un error interno: {str(e)}"
        )
    return None

@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user_partial(
    user_id: int,
    body: dict, # Simplificado para recibir campos parciales
    db: AsyncSession = Depends(get_db),
):
    """Actualiza campos de un usuario (solo admin)."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    if "role" in body:
        user.role = body["role"]
    if "is_active" in body:
        user.is_active = body["is_active"]
    if "display_name" in body:
        user.display_name = body["display_name"]
        
    await db.commit()
    await db.refresh(user)
    return user

@router.post("/users/{id}/adjust-points")
async def adjust_user_points(id: int, db: AsyncSession = Depends(get_db)):
    return {"status": "ok"}

# ── Special Bets ──────────────────────────────────────────────────────────────

@router.get("/special-bets/pending")
async def get_pending_special_bets(db: AsyncSession = Depends(get_db)):
    from app.models.models import SpecialBetCategory
    stmt = select(SpecialBetCategory).order_by(SpecialBetCategory.deadline.asc())
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/special-bets/{category_id}/resolve")
async def resolve_special_bet(
    category_id: int, 
    body: dict, # {"answer": "Real Answer"}
    db: AsyncSession = Depends(get_db)
):
    from app.models.models import SpecialBetCategory, SpecialBetAnswer, User
    from app.core.utils import fuzzy_match
    
    category = await db.get(SpecialBetCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    real_answer = body.get("answer")
    if not real_answer:
        raise HTTPException(status_code=400, detail="Missing answer")
        
    category.correct_answer = real_answer
    category.is_resolved = True
    
    # Get all predictions for this category
    stmt = select(SpecialBetAnswer).where(SpecialBetAnswer.category_id == category_id)
    answers = (await db.execute(stmt)).scalars().all()
    
    points_to_award = category.points_reward
    resolved_count = 0
    
    for ans in answers:
        is_correct = False
        # Text-based matching
        if ans.answer_text:
            is_correct = fuzzy_match(ans.answer_text, str(real_answer))
        # ID-based matching (for team/player selects)
        elif ans.answer_team_id:
            is_correct = str(ans.answer_team_id) == str(real_answer)
        elif ans.answer_player_id:
            is_correct = str(ans.answer_player_id) == str(real_answer)
            
        if is_correct:
            ans.is_correct = True
            ans.points_earned = points_to_award
            # Update user points
            user = await db.get(User, ans.user_id)
            if user:
                user.total_points += points_to_award
            resolved_count += 1
        else:
            ans.is_correct = False
            ans.points_earned = 0
            
    await db.commit()
    return {"status": "success", "resolved_count": resolved_count, "total_processed": len(answers)}

@router.patch("/special-bets/{category_id}/deadline")
async def update_special_bet_deadline(
    category_id: int,
    body: dict,  # {"deadline": "2026-06-11T15:00:00Z"}
    db: AsyncSession = Depends(get_db),
):
    """Actualiza la fecha límite de una categoría de apuesta especial."""
    from app.models.models import SpecialBetCategory
    from datetime import datetime, timezone

    category = await db.get(SpecialBetCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    raw_deadline = body.get("deadline")
    if not raw_deadline:
        raise HTTPException(status_code=400, detail="Se requiere el campo 'deadline'")

    # Parse ISO string and ensure UTC
    try:
        dt = datetime.fromisoformat(raw_deadline.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=422, detail="Formato de fecha inválido")

    category.deadline = dt
    await db.commit()
    await db.refresh(category)
    return {"id": category.id, "name": category.name, "deadline": category.deadline.isoformat()}

# ── Config & Logs ─────────────────────────────────────────────────────────────

@router.get("/config", response_model=PollaConfigResponse)
async def get_config(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PollaConfig).limit(1))
    config = result.scalar_one_or_none()
    if not config:
        # Create a default config if none exists
        from datetime import datetime, timezone
        config = PollaConfig(
            name="Mundial 2026",
            entry_deadline=datetime(2026, 6, 11, tzinfo=timezone.utc),
            points_exact_score=3,
            points_correct_result=1,
            points_special_champion=30,
            points_special_subchampion=20,
            points_special_third_place=10
        )
        db.add(config)
        await db.commit()
        await db.refresh(config)
    return config

@router.put("/config", response_model=PollaConfigResponse)
async def update_config(body: PollaConfigUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PollaConfig).limit(1))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)
    
    await db.commit()

    # Sync special categories points if they were updated
    from app.models.models import SpecialBetCategory
    
    mapping = {
        "points_special_champion": "Campeón",
        "points_special_subchampion": "Subcampeón",
        "points_special_third_place": "Tercer lugar",
        "points_special_scorer": "Goleador del torneo",
        "points_special_best_player": "Mejor jugador del torneo"
    }

    for config_key, cat_name in mapping.items():
        if config_key in update_data:
            stmt = select(SpecialBetCategory).where(SpecialBetCategory.name == cat_name)
            cat = (await db.execute(stmt)).scalar_one_or_none()
            if cat:
                cat.points_reward = update_data[config_key]
    
    await db.commit()
    await db.refresh(config)
    return config

@router.get("/logs")
async def get_logs(db: AsyncSession = Depends(get_db)):
    return []

@router.get("/points-history")
async def get_points_history(db: AsyncSession = Depends(get_db)):
    return []
