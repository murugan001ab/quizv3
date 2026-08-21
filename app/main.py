import asyncio
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from sqlalchemy import select
from app.database import init_db, AsyncSessionLocal
from app.routers import (
    auth,
    admin,
    user,
    ws,
    live,
    public,
)
from app.core.security import hash_password
from app.models.user import User

load_dotenv()

_origins_env = os.getenv("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",")]

app = FastAPI(
    title="Quiz App",
    description="MCQ Quiz platform with Admin & User panels + WebSocket live monitoring",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(user.router)
app.include_router(ws.router)
app.include_router(live.router)
app.include_router(public.router)

_expiry_reaper_task = None


async def _expiry_reaper():
    while True:
        try:
            from sqlalchemy import select
            from sqlalchemy.orm import selectinload
            from app.models.quiz import QuizAttempt, Quiz
            from app.routers.user import finalize_if_expired

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(QuizAttempt).options(selectinload(QuizAttempt.quiz)).where(
                        QuizAttempt.submitted.is_(False)
                    )
                )
                attempts = result.scalars().all()
                for attempt in attempts:
                    if attempt.quiz is not None:
                        await finalize_if_expired(db, attempt, attempt.quiz)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"⚠️ expiry reaper failed: {exc}")
        await asyncio.sleep(15)


@app.on_event("startup")
async def startup():
    await init_db()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == "admin"))
        if not result.scalar_one_or_none():
            admin_user = User(
                name="Admin",
                username="admin",
                email="admin@quiz.com",
                hashed_password=hash_password("Admin@123"),
                is_admin=True,
            )
            db.add(admin_user)
            await db.commit()
            print("✅ Default admin created: admin / admin123")
    global _expiry_reaper_task
    if _expiry_reaper_task is None or _expiry_reaper_task.done():
        _expiry_reaper_task = asyncio.create_task(_expiry_reaper())


@app.on_event("shutdown")
async def shutdown():
    global _expiry_reaper_task
    if _expiry_reaper_task and not _expiry_reaper_task.done():
        _expiry_reaper_task.cancel()
        try:
            await _expiry_reaper_task
        except asyncio.CancelledError:
            pass


@app.get("/")
async def root():
    return {"message": "Quiz App API", "docs": "/docs"}
