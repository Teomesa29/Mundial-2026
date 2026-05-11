import asyncio
import sys
from dotenv import load_dotenv
load_dotenv('backend/.env')

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import text

sys.path.append('backend')
from app.core.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as db:
        try:
            print("Refrescando la vista materializada leaderboard...")
            await db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard"))
            await db.commit()
            print("Vista materializada refrescada (CONCURRENTLY).")
        except Exception as e:
            print(f"Error con CONCURRENTLY, intentando sin CONCURRENTLY: {e}")
            await db.rollback()
            await db.execute(text("REFRESH MATERIALIZED VIEW leaderboard"))
            await db.commit()
            print("Vista materializada refrescada (SIN CONCURRENTLY).")

if __name__ == "__main__":
    asyncio.run(main())
