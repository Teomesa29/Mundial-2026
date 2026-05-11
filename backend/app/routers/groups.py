from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db

router = APIRouter()

@router.get("/")
async def read_groups(db: AsyncSession = Depends(get_db)):
    return []

@router.get("/{group_name}")
async def read_group(group_name: str, db: AsyncSession = Depends(get_db)):
    return {"group": group_name}
