"""
Create sample users.

Usage:
    python seed_user.py
"""

import asyncio

from sqlalchemy import select

from app.database import AsyncSessionLocal, init_db
from app.models.user import User
from app.core.security import hash_password


SAMPLE_USERS = [
    
    {
        "name": "vishnu ",
        "username": "user4",
        "email": "user4@gmail.com",
        "password": "123",
        "is_admin": False,
        "profile_url": None,
    },
]


async def seed_users():
    await init_db()

    async with AsyncSessionLocal() as db:
        try:
            for user_data in SAMPLE_USERS:
                result = await db.execute(
                    select(User).where(
                        (User.username == user_data["username"])
                        | (User.email == user_data["email"])
                    )
                )

                existing_user = result.scalar_one_or_none()

                if existing_user:
                    print(
                        f"⚠️ User already exists: {user_data['username']} ({user_data['email']})"
                    )
                    continue

                user = User(
                    name=user_data["name"],
                    username=user_data["username"],
                    email=user_data["email"],
                    hashed_password=hash_password(user_data["password"]),
                    is_admin=user_data["is_admin"],
                    profile_url=user_data["profile_url"],
                )

                db.add(user)
                print(f"➕ Added user: {user_data['username']}")

            await db.commit()
            print("✅ User seed completed!")

        except Exception as exc:
            await db.rollback()
            print(f"❌ User seed failed: {exc}")
            raise


if __name__ == "__main__":
    asyncio.run(seed_users())