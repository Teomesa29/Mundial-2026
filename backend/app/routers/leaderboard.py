from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc, func, text
from app.core.database import get_db
from app.models.models import User, MatchPrediction
from app.core.deps import get_current_user

router = APIRouter()

@router.get("/")
async def get_leaderboard(db: AsyncSession = Depends(get_db)):
    # Intentar obtener datos de la vista materializada
    try:
        # Leaderboard and last-5 streaks in two queries (NOT loading all predictions)
        lb_stmt = text("SELECT * FROM leaderboard ORDER BY posicion ASC")
        
        # Only fetch last 5 scored predictions per user using a lateral subquery
        streak_stmt = text("""
            SELECT user_id, points_earned
            FROM (
                SELECT p.user_id, p.points_earned,
                       ROW_NUMBER() OVER (PARTITION BY p.user_id ORDER BY m.match_date DESC) AS rn
                FROM match_predictions p
                JOIN matches m ON p.match_id = m.id
                WHERE p.points_earned IS NOT NULL
            ) ranked
            WHERE rn <= 5
            ORDER BY user_id, rn DESC
        """)

        lb_result, streak_result = await db.execute(lb_stmt), None
        rows = lb_result.all()

        if not rows:
            return []

        streak_result = await db.execute(streak_stmt)
        user_streaks: dict = {}
        for user_id, points in streak_result.all():
            if points >= 5:
                status = "E" # Exact
            elif points > 0:
                status = "W" # Winner
            else:
                status = "L" # Loss
            user_streaks.setdefault(user_id, []).append(status)

        return [
            {
                "position": row.posicion,
                "user_id": row.user_id,
                "display_name": row.nombre_mostrar,
                "user": {"display_name": row.nombre_mostrar, "avatar_url": row.avatar_url},
                "total_points": row.puntos_totales,
                "exact_count": row.exactos,
                "correct_count": row.acertados,
                "special_correct": row.especiales,
                "streak": user_streaks.get(row.user_id, []),
            }
            for row in rows
        ]

    except Exception as e:
        # Fallback por si la vista no existe o falla
        import logging
        logger = logging.getLogger("uvicorn.error")
        logger.error(f"Error fetching leaderboard from view: {e}")
        result = await db.execute(select(User).where(User.is_active == True).order_by(desc(User.total_points)))
        users = result.scalars().all()
        return [
            {
                "position": i + 1,
                "user_id": u.id,
                "display_name": u.display_name or u.username,
                "user": {"display_name": u.display_name or u.username, "avatar_url": u.avatar_url},
                "total_points": u.total_points,
                "exact_count": 0,
                "correct_count": 0,
                "special_correct": 0,
                "streak": [],
            }
            for i, u in enumerate(users)
        ]

@router.get("/top/{n}")
async def get_top_n(n: int, db: AsyncSession = Depends(get_db)):
    lb = await get_leaderboard(db)
    return lb[:n]

@router.get("/me")
async def get_my_ranking(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # count users with more points
    result = await db.execute(select(func.count(User.id)).where(User.total_points > current_user.total_points))
    position = result.scalar() + 1
    return {"position": position}

@router.get("/history")
async def get_history(db: AsyncSession = Depends(get_db)):
    return []
