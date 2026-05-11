import asyncio
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

async def check_venues():
    api_key = os.getenv("FOOTBALL_API_KEY", "bb9db39a06e3462b9d3e7a4e7f68cab9")
    headers = {"X-Auth-Token": api_key}
    url = "https://api.football-data.org/v4/competitions/WC/matches"
    
    async with httpx.AsyncClient() as client:
        r = await client.get(url, headers=headers)
        data = r.json()
        matches = data.get("matches", [])
        
        venues = {}
        for m in matches:
            v = m.get("venue")
            venues[v] = venues.get(v, 0) + 1
            
        print("Venues found in API:")
        for v, count in venues.items():
            print(f" - {v}: {count} matches")

if __name__ == "__main__":
    asyncio.run(check_venues())
