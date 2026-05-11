import asyncio
import sys
from dotenv import load_dotenv
load_dotenv('backend/.env')

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

sys.path.append('backend')
from app.core.database import AsyncSessionLocal
from app.models.models import User, MatchPrediction, SpecialBetAnswer, PointsHistory, UserBracket, Match, Team, Stadium
from app.models.enums import PointSourceType
import uuid
from datetime import datetime

async def main():
    async with AsyncSessionLocal() as db:
        # Check if we have at least one match, category etc.
        match = (await db.execute(select(Match).limit(1))).scalar_one_or_none()
        
        # Create a test user
        rand_suffix = str(uuid.uuid4())[:8]
        new_user = User(
            email=f"test_del_{rand_suffix}@test.com",
            username=f"test_{rand_suffix}",
            hashed_password="xxx",
            role="participant",
            is_active=True
        )
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
        user_id = new_user.id
        print(f"Created user {user_id}")

        if match:
            pred = MatchPrediction(
                user_id=user_id,
                match_id=match.id,
                predicted_home_score=1,
                predicted_away_score=0
            )
            db.add(pred)
            await db.commit()
            print("Added MatchPrediction")
            
        ph = PointsHistory(
            user_id=user_id,
            source_type=PointSourceType.match_prediction,
            source_id=1,
            points_delta=10,
            description="Test"
        )
        db.add(ph)
        
        ub = UserBracket(
            user_id=user_id,
            bracket_data={}
        )
        db.add(ub)
        
        await db.commit()
        print("Added PointsHistory and UserBracket")

        # Now try to delete it
        user = await db.get(User, user_id)
        try:
            await db.delete(user)
            await db.commit()
            print("Successfully deleted user")
        except Exception as e:
            print(f"Failed to delete user: {e}")

if __name__ == "__main__":
    asyncio.run(main())
