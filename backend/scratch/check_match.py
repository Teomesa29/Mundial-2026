import asyncio
import httpx
import json

async def check_match():
    base_url = "http://localhost:8000/api/v1"
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{base_url}/matches/")
        matches = r.json()
        if matches:
            print(json.dumps(matches[0], indent=2))

if __name__ == "__main__":
    asyncio.run(check_match())
