import asyncio
import sys
from dotenv import load_dotenv
load_dotenv('backend/.env')

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

sys.path.append('backend')
from app.core.database import async_engine

async def main():
    async with async_engine.connect() as conn:
        result = await conn.execute(text("""
            SELECT
                tc.table_name,
                kcu.column_name,
                rc.delete_rule AS on_delete
            FROM
                information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.referential_constraints AS rc
                  ON tc.constraint_name = rc.constraint_name
                  AND tc.table_schema = rc.constraint_schema
            WHERE
                tc.constraint_type = 'FOREIGN KEY'
                AND rc.unique_constraint_name IN (
                    SELECT constraint_name 
                    FROM information_schema.table_constraints 
                    WHERE table_name = 'users' AND constraint_type IN ('PRIMARY KEY', 'UNIQUE')
                );
        """))
        for row in result:
            print(f"Table: {row[0]}, Column: {row[1]}, On Delete: {row[2]}")

if __name__ == '__main__':
    asyncio.run(main())
