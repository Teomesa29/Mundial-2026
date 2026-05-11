import asyncio
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(dotenv_path="c:/Users/mateo/OneDrive/Documents/Mundial/backend/.env")

from app.core.database import AsyncSessionLocal
from app.services.sync_service import sync_stadiums, sync_matches, sync_teams_and_groups

async def run_sync():
    async with AsyncSessionLocal() as db:
        print("Syncing stadiums...")
        stadiums_res = await sync_stadiums(db)
        print(f"Stadiums: {stadiums_res.created} created, {stadiums_res.updated} updated")
        
        print("Syncing teams and groups...")
        teams_res = await sync_teams_and_groups(db)
        print(f"Teams: {teams_res.created} created, {teams_res.updated} updated")
        
        print("Syncing matches...")
        matches_res = await sync_matches(db)
        print(f"Matches: {matches_res.created} created, {matches_res.updated} updated")

if __name__ == "__main__":
    asyncio.run(run_sync())
