import time
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.database import async_engine, check_db_connection, AsyncSessionLocal
from app.services.sync_service import sync_matches, sync_scorers, sync_standings

logger = logging.getLogger("uvicorn.error")
boot_time = time.time()

# Cache for database health check to prevent frequent wakeups of Neon DB
last_db_check_time = None
cached_db_ok = False
cached_db_response_ms = 0.0
DB_CHECK_CACHE_DURATION_SECONDS = 3600  # 60 minutes

from sqlalchemy import select, or_, and_
from app.models.models import Match
from app.models.enums import MatchStatus

last_daily_sync_time = datetime.now(timezone.utc)

async def auto_sync_loop():
    global last_daily_sync_time
    # Esperar un poco al inicio para no interferir con la inicialización del servidor
    await asyncio.sleep(10)
    
    # Sincronización inicial si la BD está vacía
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(Match).limit(1)
            any_match = (await session.execute(stmt)).scalar_one_or_none()
            if not any_match:
                logger.info("Base de datos de partidos vacía. Sincronización inicial...")
                await sync_matches(session)
                await sync_standings(session)
            
            # Siempre asegurar que last_daily_sync_time esté seteado tras la inicialización
            last_daily_sync_time = datetime.now(timezone.utc)
    except Exception as e:
        logger.error(f"Error en sincronización inicial: {e}")
        # En caso de error, también establecemos la hora para evitar un bucle continuo de reintentos
        last_daily_sync_time = datetime.now(timezone.utc)

    while True:
        sleep_seconds = 120  # Por defecto 2 minutos
        try:
            async with AsyncSessionLocal() as session:
                now = datetime.now(timezone.utc)

                # 1. Comprobar si hay partidos activos o por empezar en los próximos 15 minutos
                active_matches_stmt = select(Match).where(
                    or_(
                        Match.status == MatchStatus.live,
                        and_(
                            Match.status == MatchStatus.scheduled,
                            Match.match_date <= now + timedelta(minutes=15),
                            Match.match_date >= now - timedelta(hours=3)
                        )
                    )
                )
                active_matches_res = await session.execute(active_matches_stmt)
                active_matches = active_matches_res.scalars().all()
                is_active_mode = len(active_matches) > 0
                
                # 2. Si no hay partidos activos, comprobar si es horario de inactividad (Quiet Window: 11 PM - 11 AM Colombia)
                is_quiet = False
                if not is_active_mode:
                    colombia_tz = timezone(timedelta(hours=-5))
                    now_colombia = datetime.now(colombia_tz)
                    
                    if now_colombia.hour < 11 or now_colombia.hour >= 23:
                        is_quiet = True
                        if now_colombia.hour < 11:
                            quiet_wake = now_colombia.replace(hour=11, minute=0, second=0, microsecond=0)
                        else:
                            quiet_wake = (now_colombia + timedelta(days=1)).replace(hour=11, minute=0, second=0, microsecond=0)
                        
                        quiet_wake_utc = quiet_wake.astimezone(timezone.utc)
                        wake_target_utc = quiet_wake_utc
                        
                        # Comprobar si hay un próximo partido programado antes del fin del horario de inactividad
                        next_match_stmt = select(Match).where(
                            Match.status == MatchStatus.scheduled,
                            Match.match_date > now
                        ).order_by(Match.match_date.asc()).limit(1)
                        next_match_res = await session.execute(next_match_stmt)
                        next_match = next_match_res.scalar_one_or_none()
                        
                        if next_match:
                            match_wake_utc = next_match.match_date - timedelta(minutes=15)
                            if match_wake_utc < wake_target_utc:
                                wake_target_utc = match_wake_utc
                                
                        sleep_seconds = max(60.0, (wake_target_utc - now).total_seconds())
                
                if is_quiet:
                    logger.info(
                        f"Horario Inactivo (11 PM - 11 AM Colombia) y sin partidos activos. "
                        f"Dormido durante {int(sleep_seconds / 60)} minutos..."
                    )
                else:
                    # 3. Determinar qué sincronizar y la frecuencia
                    if is_active_mode:
                        logger.info(f"Modo Activo: {len(active_matches)} partido(s) activo(s). Sincronizando marcadores...")
                        await sync_matches(session)
                        sleep_seconds = 120  # Actualizar marcadores cada 2 minutos durante partidos en vivo
                    else:
                        # En modo inactivo (fuera del quiet window pero sin partidos activos),
                        # calcular el tiempo restante hasta el próximo partido
                        next_match_stmt = select(Match).where(
                            Match.status == MatchStatus.scheduled,
                            Match.match_date > now
                        ).order_by(Match.match_date.asc()).limit(1)
                        next_match_res = await session.execute(next_match_stmt)
                        next_match = next_match_res.scalar_one_or_none()
                        
                        if next_match:
                            time_to_match = next_match.match_date - now
                            time_to_match_minutes = int(time_to_match.total_seconds() / 60)
                            
                            # Despertarse 15 minutos antes del próximo partido, pero dormir como máximo 720 minutos (12 horas)
                            sleep_seconds = max(5, min(time_to_match_minutes - 15, 720)) * 60
                            logger.info(
                                f"Modo Inactivo: Próximo partido en {time_to_match_minutes} minutos. "
                                f"Durmiendo por {int(sleep_seconds / 60)} minutos..."
                            )
                        else:
                            # Si no hay partidos programados
                            sleep_seconds = 720 * 60
                            logger.info("Modo Inactivo: Sin partidos programados pendientes. Durmiendo por 12 horas...")
                    
                    # 4. Sincronización diaria obligatoria (Standings, Scorers y Matches para mantenimiento de BD)
                    if last_daily_sync_time is None or (now - last_daily_sync_time) > timedelta(hours=24):
                        logger.info("Ejecutando sincronización diaria de mantenimiento (Standings, Scorers y Matches)...")
                        if not is_active_mode:
                            # Si no se sincronizó arriba, sincronizar matches ahora
                            await sync_matches(session)
                        await sync_standings(session)
                        last_daily_sync_time = now
                        logger.info("Sincronización diaria de mantenimiento finalizada con éxito.")
                        
        except Exception as e:
            logger.error(f"Error en auto_sync_loop: {e}")
            sleep_seconds = 7 * 60  # reintentar pronto
            
        await asyncio.sleep(sleep_seconds)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global last_db_check_time, cached_db_ok, cached_db_response_ms
    # Startup
    logger.info("Application starting up...")
    db_ok, response_ms = await check_db_connection()
    if db_ok:
        logger.info(f"Database connection successful ({response_ms}ms)")
        cached_db_ok = True
        cached_db_response_ms = response_ms
        last_db_check_time = time.time()
    else:
        logger.error("Failed to connect to the database on startup")
        cached_db_ok = False
        cached_db_response_ms = 0.0
        last_db_check_time = time.time()
    
    sync_task = asyncio.create_task(auto_sync_loop())
    
    yield
    
    # Shutdown
    logger.info("Application shutting down...")
    sync_task.cancel()
    await async_engine.dispose()
    logger.info("Database connection closed")

app = FastAPI(
    title=settings.APP_NAME,
    description="API para polla deportiva del Mundial de Fútbol 2026",
    version=settings.VERSION,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan
)

from starlette.middleware.base import BaseHTTPMiddleware

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/health":
            return await call_next(request)
        
        start_time = time.time()
        response = await call_next(request)
        duration = round((time.time() - start_time) * 1000, 2)
        
        logger.info(f"{request.method} {request.url.path} - {response.status_code} - {duration}ms")
        return response

# Middlewares (order: added last = executed first/outermost)
app.add_middleware(GZipMiddleware, minimum_size=1000)
if settings.is_production:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])

app.add_middleware(RequestLoggingMiddleware)

# CORS must be the outermost to handle all responses
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception Handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Invalid request parameters", "errors": exc.errors()}
    )

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected error occurred. Please try again later."}
    )

# Routers Placeholders
from app.routers import auth, teams, groups, matches, players, predictions, special_bets, leaderboard, users, admin, sync

app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(teams.router, prefix="/api/v1/teams", tags=["Teams"])
app.include_router(groups.router, prefix="/api/v1/groups", tags=["Groups"])
app.include_router(matches.router, prefix="/api/v1/matches", tags=["Matches"])
app.include_router(players.router, prefix="/api/v1/players", tags=["Players"])
app.include_router(predictions.router, prefix="/api/v1/predictions", tags=["Predictions"])
app.include_router(special_bets.router, prefix="/api/v1/special-bets", tags=["Special Bets"])
app.include_router(leaderboard.router, prefix="/api/v1/leaderboard", tags=["Leaderboard"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
app.include_router(sync.router, prefix="/api/v1/sync", tags=["Sync"])

@app.api_route("/", methods=["GET", "HEAD"])
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.VERSION,
        "status": "running",
        "environment": settings.ENVIRONMENT,
        "docs": "/docs" if not settings.is_production else None
    }

@app.api_route("/health", methods=["GET", "HEAD"])
async def health_check(refresh: bool = False):
    global last_db_check_time, cached_db_ok, cached_db_response_ms
    
    now = time.time()
    
    # Forzar el uso de la caché para no despertar la base de datos en Neon,
    # a menos que se solicite un refresco explícito
    use_cache = not refresh and last_db_check_time is not None
        
    if use_cache:
        db_ok = cached_db_ok
        response_ms = cached_db_response_ms
    else:
        db_ok, response_ms = await check_db_connection()
        cached_db_ok = db_ok
        cached_db_response_ms = response_ms
        last_db_check_time = now
        
    uptime_seconds = int(time.time() - boot_time)
    
    health_status = "healthy" if db_ok else "degraded"
    status_code = status.HTTP_200_OK if db_ok else status.HTTP_503_SERVICE_UNAVAILABLE
    
    response = {
        "status": health_status,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "database": {
            "status": "connected" if db_ok else "disconnected",
            "response_time_ms": response_ms,
            "cached": not (refresh or last_db_check_time == now)
        },
        "uptime_seconds": uptime_seconds
    }
    
    return JSONResponse(status_code=status_code, content=response)

@app.get("/api/v1")
async def api_info():
    return {
        "version": settings.VERSION,
        "available_endpoints": [
            "/api/v1/auth",
            "/api/v1/users",
            "/api/v1/teams",
            "/api/v1/groups",
            "/api/v1/matches",
            "/api/v1/players",
            "/api/v1/predictions",
            "/api/v1/special-bets",
            "/api/v1/leaderboard",
            "/api/v1/admin"
        ]
    }
