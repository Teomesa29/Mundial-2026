from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.sync_service import sync_standings, sync_players, sync_scorers, sync_matches
from app.core.deps import get_current_user
from app.models.models import User

router = APIRouter(tags=["Sync"])

@router.post("/matches")
async def trigger_sync_matches(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can sync data")
    result = await sync_matches(db)
    return result

@router.post("/standings")
async def trigger_sync_standings(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can sync data")
    result = await sync_standings(db)
    return result

@router.post("/players")
async def trigger_sync_players(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can sync data")
    result = await sync_players(db)
    return result

@router.post("/scorers")
async def trigger_sync_scorers(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can sync data")
    result = await sync_scorers(db)
    return result
