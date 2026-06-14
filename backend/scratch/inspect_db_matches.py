import asyncio
from app.core.database import SessionLocal
from app.models.models import Match
from app.models.enums import MatchStage
from sqlalchemy import select, func

async def main():
    async with SessionLocal() as db:
        res = await db.execute(select(Match.stage, func.count(Match.id)).group_by(Match.stage))
        counts = res.all()
        print("Matches in DB by stage:")
        for stage, count in counts:
            print(f"- {stage}: {count}")

if __name__ == "__main__":
    asyncio.run(main())
