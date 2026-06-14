import asyncio
from app.core.database import AsyncSessionLocal
from app.models.models import Match
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(Match)
            .order_by(Match.match_number)
        )
        matches = res.scalars().all()
        print(f"Total matches in DB: {len(matches)}")
        knockouts = [m for m in matches if m.stage != 'group']
        print(f"Total knockout matches in DB: {len(knockouts)}")
        for m in knockouts[:10]:
            print(f"Match ID: {m.id}, Number: {m.match_number}, Stage: {m.stage}, Teams: {m.home_team_id} vs {m.away_team_id}")

if __name__ == "__main__":
    asyncio.run(main())
