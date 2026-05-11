import httpx
import logging
import asyncio
from typing import Optional, Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)

class FootballAPIClient:
    def __init__(self):
        self.base_url = settings.FOOTBALL_API_URL
        self.headers = {"X-Auth-Token": settings.FOOTBALL_API_KEY}
        self.timeout = 10.0

    async def _request(self, endpoint: str, params: Optional[Dict] = None) -> Optional[Dict[str, Any]]:
        url = f"{self.base_url}{endpoint}"
        
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.get(url, headers=self.headers, params=params)
                    
                    if response.status_code == 200:
                        return response.json()
                    elif response.status_code == 429:
                        wait_time = 2 ** attempt
                        logger.warning(f"Rate limited (429) on {url}. Waiting {wait_time}s...")
                        await asyncio.sleep(wait_time)
                        continue
                    elif response.status_code == 404:
                        logger.warning(f"Not found (404) for {url}")
                        return None
                    else:
                        logger.error(f"API error: {response.status_code} on {url} - {response.text}")
                        response.raise_for_status()
            except httpx.TimeoutException:
                logger.error(f"Timeout on {url}")
                if attempt == 2:
                    raise Exception(f"Timeout fetching data from {url}")
                await asyncio.sleep(1)
            except Exception as e:
                logger.error(f"Request failed: {url} - {e}")
                raise
                
        return None

    async def get_all_matches(self) -> Optional[Dict]:
        return await self._request("/competitions/WC/matches")

    async def get_live_matches(self) -> Optional[Dict]:
        return await self._request("/competitions/WC/matches", params={"status": "LIVE"})

    async def get_finished_matches(self) -> Optional[Dict]:
        return await self._request("/competitions/WC/matches", params={"status": "FINISHED"})

    async def get_match_detail(self, external_id: int) -> Optional[Dict]:
        return await self._request(f"/matches/{external_id}")

    async def get_standings(self) -> Optional[Dict]:
        return await self._request("/competitions/WC/standings")

    async def get_scorers(self, limit: int = 20) -> Optional[Dict]:
        return await self._request("/competitions/WC/scorers", params={"limit": limit})

    async def get_teams(self) -> Optional[Dict]:
        return await self._request("/competitions/WC/teams")

    async def get_team_squad(self, team_id: int) -> Optional[Dict]:
        return await self._request(f"/teams/{team_id}")

football_api = FootballAPIClient()
