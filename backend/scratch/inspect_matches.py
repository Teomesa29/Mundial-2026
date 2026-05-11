import asyncio
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

async def inspect_matches():
    api_key = os.getenv("FOOTBALL_API_KEY", "bb9db39a06e3462b9d3e7a4e7f68cab9")
    headers = {"X-Auth-Token": api_key}
    url = "https://api.football-data.org/v4/competitions/WC/matches"
    
    async with httpx.AsyncClient() as client:
        r = await client.get(url, headers=headers)
        data = r.json()
        matches = data.get("matches", [])
        
        for i, m in enumerate(matches[:5]):
            print(f"Match {i+1}:")
            print(f"  ID: {m.get('id')}")
            print(f"  Date: {m.get('utcDate')}")
            print(f"  Matchday: {m.get('matchday')}")
            print(f"  Stage: {m.get('stage')}")
            print(f"  Group: {m.get('group')}")
            print(f"  Home: {m.get('homeTeam', {}).get('name')}")
            print(f"  Away: {m.get('awayTeam', {}).get('name')}")

if __name__ == "__main__":
    asyncio.run(inspect_matches())
