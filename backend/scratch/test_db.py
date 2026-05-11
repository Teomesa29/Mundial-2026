
import asyncio
import sys
import os

# Add the project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.models import User

async def test_db():
    print("Testing database connection and users...")
    try:
        async with AsyncSessionLocal() as session:
            query = select(User)
            result = await session.execute(query)
            users = result.scalars().all()
            print(f"Found {len(users)} users.")
            for user in users:
                print(f"User: {user.email}, Active: {user.is_active}, Role: {user.role}, Role Type: {type(user.role)}")
    except Exception as e:
        print(f"Error connecting to database: {e}")

if __name__ == "__main__":
    asyncio.run(test_db())
