import asyncio
import httpx

async def test_endpoints():
    base_url = "http://localhost:8000/api/v1"
    endpoints = [
        "/leaderboard/",
        "/leaderboard/top/3",
        "/matches/live",
        "/matches/upcoming"
    ]
    
    async with httpx.AsyncClient() as client:
        for ep in endpoints:
            try:
                print(f"Testing {ep}...")
                r = await client.get(f"{base_url}{ep}")
                print(f"  Status: {r.status_code}")
                if r.status_code != 200:
                    print(f"  Error: {r.text}")
                else:
                    print(f"  Success (length: {len(r.text)})")
                    # print(r.json()) # Optional
            except Exception as e:
                print(f"  Connection Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_endpoints())
