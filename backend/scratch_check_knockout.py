import asyncio
from app.core.database import AsyncSessionLocal
from app.models.models import Match
from sqlalchemy import select

async def run():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Match).where(Match.stage != 'group').order_by(Match.match_number))
        matches = result.scalars().all()
        print(f"Total knockout matches: {len(matches)}")
        for m in matches:
            print(f"Match {m.match_number} ({m.stage}): {m.home_team_id} vs {m.away_team_id}")

asyncio.run(run())
