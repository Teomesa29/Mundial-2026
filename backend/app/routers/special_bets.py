from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import User, SpecialBetCategory, SpecialBetAnswer
from app.schemas.schemas import SpecialBetCategoryResponse, SpecialBetAnswerCreate, SpecialBetAnswerResponse

router = APIRouter()

@router.get("/categories", response_model=List[SpecialBetCategoryResponse])
async def get_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SpecialBetCategory))
    return result.scalars().all()

@router.get("/my", response_model=List[SpecialBetAnswerResponse])
async def get_my_special_bets(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(SpecialBetAnswer).where(SpecialBetAnswer.user_id == current_user.id))
    return result.scalars().all()

@router.post("/", response_model=SpecialBetAnswerResponse)
async def create_special_bet(bet: SpecialBetAnswerCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.models import PollaConfig
    config_result = await db.execute(select(PollaConfig))
    config = config_result.scalar_one_or_none()
    
    if config:
        from datetime import datetime, timezone
        from fastapi import HTTPException
        now = datetime.now(timezone.utc)
        
        # 1. Global open status
        if not config.is_registration_open:
            raise HTTPException(status_code=400, detail="El registro de predicciones está cerrado.")
            
        # 2. Global entry deadline
        if config.entry_deadline:
            deadline = config.entry_deadline.replace(tzinfo=timezone.utc) if config.entry_deadline.tzinfo is None else config.entry_deadline
            if now > deadline:
                raise HTTPException(status_code=400, detail="El plazo de inscripción general ha vencido.")

    # Check if category exists and deadline
    cat_stmt = select(SpecialBetCategory).where(SpecialBetCategory.id == bet.category_id)
    category = (await db.execute(cat_stmt)).scalar_one_or_none()
    
    if not category:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    
    # Bounded by config.entry_deadline if set
    effective_deadline = category.deadline
    if config and config.entry_deadline:
        effective_deadline = config.entry_deadline
        
    from datetime import datetime, timezone
    # Ensure timezone awareness
    if effective_deadline.tzinfo is None:
        effective_deadline = effective_deadline.replace(tzinfo=timezone.utc)
    else:
        effective_deadline = effective_deadline.astimezone(timezone.utc)
        
    if effective_deadline <= datetime.now(timezone.utc):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="El tiempo para enviar esta predicción ha expirado.")

    # Upsert: update if exists, create otherwise
    existing_stmt = select(SpecialBetAnswer).where(
        SpecialBetAnswer.user_id == current_user.id,
        SpecialBetAnswer.category_id == bet.category_id
    )
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()

    if existing:
        # Update the existing answer
        if bet.answer_team_id is not None:
            existing.answer_team_id = bet.answer_team_id
            existing.answer_text = None
            existing.answer_player_id = None
        elif bet.answer_text is not None:
            existing.answer_text = bet.answer_text
            existing.answer_team_id = None
            existing.answer_player_id = None
        await db.commit()
        await db.refresh(existing)
        return existing

    new_bet = SpecialBetAnswer(user_id=current_user.id, **bet.model_dump())
    db.add(new_bet)
    await db.commit()
    await db.refresh(new_bet)
    return new_bet

@router.get("/my/stats")
async def get_my_special_stats(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"completed": 0, "pending": 0}
