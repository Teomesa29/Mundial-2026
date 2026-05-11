from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import User
from app.schemas.schemas import UserResponse

router = APIRouter()

@router.get("/me", response_model=UserResponse)
async def get_my_profile(current_user: User = Depends(get_current_user)):
    return current_user

@router.put("/me")
async def update_my_profile(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return current_user

@router.put("/me/password")
async def change_password(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return {"status": "ok"}

@router.get("/{user_id}/profile", response_model=UserResponse)
async def get_user_profile(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
