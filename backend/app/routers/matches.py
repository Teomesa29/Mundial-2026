from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from app.core.database import get_db
from app.models.models import Match, PollaConfig
from app.schemas.schemas import MatchResponse, PollaConfigResponse

router = APIRouter()

@router.get("/", response_model=List[MatchResponse])
async def read_matches(db: AsyncSession = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    result = await db.execute(
        select(Match)
        .options(
            joinedload(Match.home_team), 
            joinedload(Match.away_team),
            joinedload(Match.group),
            joinedload(Match.stadium)
        )
    )
    matches = result.scalars().all()
    # Add group_name for compatibility with frontend
    for m in matches:
        if m.group:
            m.group_name = f"Grupo {m.group.name}"
        else:
            m.group_name = m.stage
    return matches

@router.get("/live", response_model=List[MatchResponse])
async def read_live_matches(db: AsyncSession = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    from app.models.enums import MatchStatus
    result = await db.execute(
        select(Match)
        .options(joinedload(Match.home_team), joinedload(Match.away_team), joinedload(Match.group), joinedload(Match.stadium))
        .where(Match.status == MatchStatus.live)
    )
    matches = result.scalars().all()
    for m in matches:
        m.group_name = f"Grupo {m.group.name}" if m.group else m.stage
    return matches

@router.get("/upcoming", response_model=List[MatchResponse])
async def read_upcoming_matches(db: AsyncSession = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    from app.models.enums import MatchStatus
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Match)
        .options(joinedload(Match.home_team), joinedload(Match.away_team), joinedload(Match.group), joinedload(Match.stadium))
        .where(Match.status == MatchStatus.scheduled)
        .where(Match.match_date >= now)
        .order_by(Match.match_date.asc())
        .limit(10)
    )
    matches = result.scalars().all()
    for m in matches:
        m.group_name = f"Grupo {m.group.name}" if m.group else m.stage
    return matches

@router.get("/today", response_model=List[MatchResponse])
async def read_today_matches(db: AsyncSession = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)
    
    result = await db.execute(
        select(Match)
        .options(joinedload(Match.home_team), joinedload(Match.away_team), joinedload(Match.group), joinedload(Match.stadium))
        .where(Match.match_date >= start_of_day)
        .where(Match.match_date < end_of_day)
        .order_by(Match.match_date.asc())
    )
    matches = result.scalars().all()
    for m in matches:
        m.group_name = f"Grupo {m.group.name}" if m.group else m.stage
    return matches

@router.get("/config", response_model=PollaConfigResponse)
async def get_public_config(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PollaConfig).limit(1))
    config = result.scalar_one_or_none()
    if not config:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        return PollaConfigResponse(
            id=0,
            name="Default Config",
            description="",
            season=2026,
            entry_deadline=now,
            is_registration_open=True,
            is_bracket_open=True,
            created_at=now,
            updated_at=now
        )
    return config

@router.get("/bracket-status")
async def get_bracket_status(db: AsyncSession = Depends(get_db)):
    # Check if all group stage matches are finished
    from app.models.models import Match
    from app.models.enums import MatchStage, MatchStatus
    from sqlalchemy import func
    
    # Total group matches
    total_q = select(func.count(Match.id)).where(Match.stage == MatchStage.group)
    total_res = await db.execute(total_q)
    total_count = total_res.scalar() or 0
    
    # Finished group matches
    finished_q = select(func.count(Match.id)).where(
        Match.stage == MatchStage.group,
        Match.status == MatchStatus.finished
    )
    finished_res = await db.execute(finished_q)
    finished_count = finished_res.scalar() or 0
    
    # Also check if there are actually any Round of 32 matches
    r32_q = select(func.count(Match.id)).where(Match.stage == MatchStage.round_of_32)
    r32_res = await db.execute(r32_q)
    r32_count = r32_res.scalar() or 0

    return {
        "is_ready": (finished_count >= total_count and total_count > 0) or (r32_count >= 16),
        "total_group_matches": total_count,
        "finished_group_matches": finished_count,
        "r32_matches_count": r32_count
    }

@router.get("/bracket")
async def read_bracket(db: AsyncSession = Depends(get_db)):
    return {}


@router.get("/{match_id}", response_model=MatchResponse)
async def read_match(match_id: int, db: AsyncSession = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    result = await db.execute(
        select(Match)
        .options(joinedload(Match.home_team), joinedload(Match.away_team), joinedload(Match.group), joinedload(Match.stadium))
        .where(Match.id == match_id)
    )
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if match.group:
        match.group_name = f"Grupo {match.group.name}"
    else:
        match.group_name = match.stage
    return match

@router.get("/{match_id}/events")
async def read_match_events(match_id: int, db: AsyncSession = Depends(get_db)):
    return []
