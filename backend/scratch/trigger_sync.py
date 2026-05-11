import asyncio
import os
import sys

# Set PYTHONPATH to current dir
sys.path.append(os.getcwd())

async def trigger_sync():
    from app.services.sync_service import sync_matches
    from app.core.database import AsyncSessionLocal
    
    async with AsyncSessionLocal() as db:
        result = await sync_matches(db)
        print(f"Sync completed: {result.updated} matches updated")

if __name__ == "__main__":
    asyncio.run(trigger_sync())
