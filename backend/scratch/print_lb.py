import asyncio
import httpx
import json

async def print_lb():
    base_url = "http://localhost:8000/api/v1"
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{base_url}/leaderboard/")
        print(json.dumps(r.json(), indent=2))

if __name__ == "__main__":
    asyncio.run(print_lb())
