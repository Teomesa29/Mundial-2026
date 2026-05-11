from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from app.core.database import get_db
from app.models.models import Team
from app.schemas.schemas import TeamResponse

router = APIRouter()

@router.get("/", response_model=List[TeamResponse])
async def read_teams(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Team))
    return result.scalars().all()

@router.get("/{team_id}", response_model=TeamResponse)
async def read_team(team_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team

@router.get("/{team_id}/players")
async def read_team_players(team_id: int, db: AsyncSession = Depends(get_db)):
    return []

@router.get("/{team_id}/matches")
async def read_team_matches(team_id: int, db: AsyncSession = Depends(get_db)):
    return []

@router.get("/group/{group_name}")
async def read_teams_by_group(group_name: str, db: AsyncSession = Depends(get_db)):
    return []
