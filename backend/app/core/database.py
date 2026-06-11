import time
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from .config import settings

# Async Engine (for API runtime) - Optimized with NullPool to allow Neon DB to autosuspend
async_engine = create_async_engine(
    settings.DATABASE_URL,
    poolclass=NullPool,
    connect_args={"ssl": "require"} if settings.is_production else {}
)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Sync Engine (for Alembic migrations) - Optimized with NullPool
sync_engine = create_engine(
    settings.DATABASE_URL_SYNC,
    poolclass=NullPool,
    connect_args={"sslmode": "require"} if settings.is_production else {}
)

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def check_db_connection() -> tuple[bool, float]:
    start_time = time.perf_counter()
    try:
        async with async_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return True, round(elapsed_ms, 2)
    except Exception:
        return False, 0.0
