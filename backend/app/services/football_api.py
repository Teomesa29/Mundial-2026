import httpx
import logging
import asyncio
import time
from collections import deque
from typing import Optional, Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)

# Límite oficial de football-data.org para cuentas gratuitas con API key
MAX_REQUESTS_PER_MINUTE = 10

class FootballAPIClient:
    def __init__(self):
        self.base_url = settings.FOOTBALL_API_URL
        self.headers = {"X-Auth-Token": settings.FOOTBALL_API_KEY}
        self.timeout = 10.0
        # Sliding window: almacena los timestamps de las últimas peticiones
        self._request_timestamps: deque[float] = deque()

    def _check_rate_limit(self) -> bool:
        """
        Verifica si podemos hacer otra petición sin exceder 10 req/min.
        Usa una ventana deslizante in-memory (sin I/O a la base de datos).
        Retorna True si hay presupuesto, False si se debe esperar.
        """
        now = time.monotonic()
        # Limpiar timestamps más viejos que 60 segundos
        while self._request_timestamps and (now - self._request_timestamps[0]) > 60:
            self._request_timestamps.popleft()

        if len(self._request_timestamps) >= MAX_REQUESTS_PER_MINUTE:
            oldest = self._request_timestamps[0]
            wait_needed = 60 - (now - oldest)
            logger.warning(
                f"Rate limit alcanzado ({len(self._request_timestamps)}/{MAX_REQUESTS_PER_MINUTE} req/min). "
                f"Próximo slot disponible en {wait_needed:.1f}s."
            )
            return False

        self._request_timestamps.append(now)
        return True

    async def _wait_for_rate_limit(self) -> None:
        """
        Espera activamente hasta que haya un slot disponible en la ventana de 60s.
        """
        while not self._check_rate_limit():
            now = time.monotonic()
            if self._request_timestamps:
                oldest = self._request_timestamps[0]
                wait_needed = 60 - (now - oldest) + 0.5  # +0.5s de margen
                logger.info(f"Esperando {wait_needed:.1f}s para liberar slot de rate limit...")
                await asyncio.sleep(wait_needed)
            else:
                await asyncio.sleep(1)

    async def _request(self, endpoint: str, params: Optional[Dict] = None) -> Optional[Dict[str, Any]]:
        # Esperar hasta que haya un slot libre en la ventana de rate limit
        await self._wait_for_rate_limit()

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

