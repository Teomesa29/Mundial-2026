import asyncio
import sys
import os
import httpx
from dotenv import load_dotenv

load_dotenv('backend/.env')
sys.path.append('backend')

from app.core.security import create_access_token
from app.core.database import AsyncSessionLocal
from app.models.models import User
from sqlalchemy.future import select

async def main():
    base_url = "http://127.0.0.1:8000/api/v1"
    
    # 1. Create access token for User ID 1 (Assuming 1 is admin)
    token = create_access_token(data={"sub": "1"})
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient() as client:
        # Check login
        resp = await client.get(f"{base_url}/users/me", headers=headers)
        if resp.status_code != 200:
            print("Failed to get me", resp.status_code, resp.text)
            return
            
        print("Logged in as:", resp.json().get("role"), "ID:", resp.json().get("id"))
        
        # 2. Get users list
        resp = await client.get(f"{base_url}/admin/users", headers=headers)
        if resp.status_code != 200:
            print("Failed to get users", resp.status_code, resp.text)
            return
            
        users = resp.json()
        print(f"Found {len(users)} users")
        
        # Pick one dummy user to delete or create one
        dummy_user = next((u for u in users if u["email"] == "test_api_del@test.com"), None)
        if not dummy_user:
            from app.core.security import hash_password
            async with AsyncSessionLocal() as db:
                import uuid
                new_user = User(
                    email=f"test_api_del_{uuid.uuid4().hex[:6]}@test.com",
                    username=f"test_api_del_{uuid.uuid4().hex[:6]}",
                    hashed_password=hash_password("xxx"),
                    role="participant",
                    is_active=True
                )
                db.add(new_user)
                await db.commit()
                await db.refresh(new_user)
                dummy_id = new_user.id
                print(f"Created dummy user: {dummy_id}")
        else:
            dummy_id = dummy_user["id"]
            
        # Try to delete dummy user via API
        print(f"Deleting user {dummy_id} via API")
        del_resp = await client.delete(f"{base_url}/admin/users/{dummy_id}", headers=headers)
        print(f"Delete response: {del_resp.status_code} {del_resp.text}")

if __name__ == '__main__':
    asyncio.run(main())
