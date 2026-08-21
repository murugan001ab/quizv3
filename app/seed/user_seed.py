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


SAMPLE_USERS =[
{
    "name": "Mathananandhan",
    "username": "mathananandhan58",
    "email": "mathananandhan58@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "Aashra Begam",
    "username": "aashra2005",
    "email": "aashra2005@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "Sakthi Vel",
    "username": "sakthivip70",
    "email": "Sakthivip70@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "Mani Kandan",
    "username": "manikandanelumalai2323",
    "email": "manikandanelumalai2323@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "Bharath",
    "username": "vbarathanvadivel8121",
    "email": "vbarathanvadivel8121@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "Sushmasri",
    "username": "sushmasri954",
    "email": "sushmasri954@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "Jaasam Jaasam",
    "username": "jaasamjaasam950",
    "email": "jaasamjaasam950@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "Sanjay S",
    "username": "sanjaysanthosh131920",
    "email": "sanjaysanthosh131920@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "sdharshini",
    "username": "sdharshini2032",
    "email": "sdharshini2032@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "vimalraj mca",
    "username": "mcavimalraj",
    "email": "mcavimalraj@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "Shajith Riswan",
    "username": "shajithriswan",
    "email": "shajithriswan@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "Ganesan M",
    "username": "ganesanmkvm",
    "email": "ganesanmkvm@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "Dharshini",
    "username": "dharshudimple2006",
    "email": "dharshudimple2006@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "Snekha uma Snekha uma",
    "username": "snekhaumasnekhauma",
    "email": "Snekhaumasnekhauma@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "Haridass",
    "username": "hxridass",
    "email": "hxridass@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "Deepan Raj",
    "username": "deepann0628",
    "email": "deepann0628@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "B.Balamurugan",
    "username": "murugan6380yu",
    "email": "murugan6380yu@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "Rohith Kumar",
    "username": "rohithkumar55666",
    "email": "rohithkumar55666@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "Harish M",
    "username": "harishmurugan7706",
    "email": "harishmurugan7706@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "Prabu",
    "username": "prabudakshna",
    "email": "Prabudakshna@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
},
{
    "name": "Sharin",
    "username": "heefasharin",
    "email": "heefasharin@gmail.com",
    "password": "123",
    "is_admin": False,
    "profile_url": None
}
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