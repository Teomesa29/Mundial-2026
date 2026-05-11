import asyncio
import sys
import os
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(".env")

from app.core.database import AsyncSessionLocal
from app.models.models import PollaConfig
from sqlalchemy.future import select

async def main():
    async with AsyncSessionLocal() as session:
        config = (await session.execute(select(PollaConfig))).scalar_one_or_none()
        if not config:
            print("No config found, creating one...")
            config = PollaConfig(
                is_registration_open=True,
                is_bracket_open=True,
                entry_deadline=None
            )
            session.add(config)
            await session.commit()
            print("Created default config")
        else:
            print(f"Config found. Bracket Open: {config.is_bracket_open}, Reg Open: {config.is_registration_open}")

if __name__ == '__main__':
    asyncio.run(main())
