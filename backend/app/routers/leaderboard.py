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
    # Obtener estadísticas globales de partidos para calcular progreso y fallos
    try:
        total_matches = 104
        
        finished_res = await db.execute(text("SELECT COUNT(*) FROM matches WHERE status = 'finished'"))
        finished_matches = finished_res.scalar() or 0
    except Exception as e:
        import logging
        logger = logging.getLogger("uvicorn.error")
        logger.error(f"Error fetching match counts: {e}")
        total_matches = 104
        finished_matches = 0

    # Intentar obtener datos de la vista materializada
    try:
        # Leaderboard and last-5 streaks in two queries (NOT loading all predictions)
        lb_stmt = text("SELECT * FROM leaderboard ORDER BY posicion ASC")
        
        # Only fetch last 5 scored predictions per user using a lateral subquery with match and team details
        streak_stmt = text("""
            SELECT 
                ranked.user_id, 
                ranked.points_earned,
                ranked.predicted_home_score,
                ranked.predicted_away_score,
                ranked.is_correct_result,
                ranked.is_exact_score,
                ranked.home_score,
                ranked.away_score,
                t_home.name AS home_name,
                t_home.country_code AS home_code,
                t_home.logo_url AS home_logo,
                t_away.name AS away_name,
                t_away.country_code AS away_code,
                t_away.logo_url AS away_logo
            FROM (
                SELECT p.user_id, p.points_earned, p.predicted_home_score, p.predicted_away_score,
                       p.is_correct_result, p.is_exact_score,
                       m.home_score, m.away_score, m.home_team_id, m.away_team_id,
                       ROW_NUMBER() OVER (PARTITION BY p.user_id ORDER BY m.match_date DESC) AS rn
                FROM match_predictions p
                JOIN matches m ON p.match_id = m.id
                WHERE p.points_earned IS NOT NULL
            ) ranked
            JOIN teams t_home ON ranked.home_team_id = t_home.id
            JOIN teams t_away ON ranked.away_team_id = t_away.id
            WHERE ranked.rn <= 5
            ORDER BY ranked.user_id, ranked.rn DESC
        """)

        lb_result, streak_result = await db.execute(lb_stmt), None
        rows = lb_result.all()

        if not rows:
            return []

        streak_result = await db.execute(streak_stmt)
        user_streaks: dict = {}
        for row in streak_result.all():
            points = row.points_earned
            if row.is_exact_score:
                status = "E" # Exact
            elif row.is_correct_result:
                status = "W" # Winner
            else:
                status = "L" # Loss
            
            streak_item = {
                "status": status,
                "points": points,
                "home_team": row.home_name,
                "home_code": row.home_code,
                "home_logo": row.home_logo,
                "away_team": row.away_name,
                "away_code": row.away_code,
                "away_logo": row.away_logo,
                "predicted_home_score": row.predicted_home_score,
                "predicted_away_score": row.predicted_away_score,
                "actual_home_score": row.home_score,
                "actual_away_score": row.away_score,
            }
            user_streaks.setdefault(row.user_id, []).append(streak_item)

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
                # Estadísticas dinámicas de partidos
                "matches_played": finished_matches,
                "matches_total": total_matches,
                "failed_count": max(0, finished_matches - row.acertados),
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
                # Estadísticas dinámicas de partidos fallback
                "matches_played": finished_matches,
                "matches_total": total_matches,
                "failed_count": finished_matches,
            }
            for i, u in enumerate(users)
        ]

@router.get("/top/{n}")
async def get_top_n(n: int, db: AsyncSession = Depends(get_db)):
    lb = await get_leaderboard(db)
    return lb[:n]

@router.get("/me")
async def get_my_ranking(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Try fetching the rank from the materialized view first
    try:
        lb_stmt = text("SELECT posicion FROM leaderboard WHERE user_id = :user_id")
        result = await db.execute(lb_stmt, {"user_id": current_user.id})
        position = result.scalar()
        if position is not None:
            return {"position": position}
    except Exception as e:
        import logging
        logger = logging.getLogger("uvicorn.error")
        logger.error(f"Error fetching position from leaderboard view: {e}")

    # Fallback to COUNT DISTINCT (Dense rank calculation)
    # Dense rank: number of distinct total_points values that are higher, plus 1
    res = await db.execute(
        select(func.count(func.distinct(User.total_points)))
        .where(User.total_points > current_user.total_points)
        .where(User.is_active == True)
    )
    position = res.scalar() + 1
    return {"position": position}


@router.get("/history")
async def get_history(db: AsyncSession = Depends(get_db)):
    return []
