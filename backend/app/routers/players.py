from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db

router = APIRouter()

@router.get("/")
async def read_players(db: AsyncSession = Depends(get_db)):
    return []

@router.get("/scorers")
async def read_scorers(limit: int = 20, db: AsyncSession = Depends(get_db)):
    return []

@router.get("/best-goalkeeper")
async def read_best_goalkeeper(db: AsyncSession = Depends(get_db)):
    return []

@router.get("/{player_id}")
async def read_player(player_id: int, db: AsyncSession = Depends(get_db)):
    return {"player_id": player_id}
