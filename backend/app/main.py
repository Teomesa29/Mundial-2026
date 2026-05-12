import time
import logging
import asyncio
from datetime import datetime
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

async def auto_sync_loop():
    while True:
        try:
            async with AsyncSessionLocal() as session:
                await sync_matches(session)
                await sync_standings(session)
                if datetime.now().minute == 0:
                    await sync_scorers(session)
        except Exception as e:
            logger.error(f"Sync error: {e}")
        await asyncio.sleep(settings.SYNC_INTERVAL_MINUTES * 60)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Application starting up...")
    db_ok, response_ms = await check_db_connection()
    if db_ok:
        logger.info(f"Database connection successful ({response_ms}ms)")
    else:
        logger.error("Failed to connect to the database on startup")
    
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
async def health_check():
    db_ok, response_ms = await check_db_connection()
    uptime_seconds = int(time.time() - boot_time)
    
    health_status = "healthy" if db_ok else "degraded"
    status_code = status.HTTP_200_OK if db_ok else status.HTTP_503_SERVICE_UNAVAILABLE
    
    response = {
        "status": health_status,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "database": {
            "status": "connected" if db_ok else "disconnected",
            "response_time_ms": response_ms
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
