from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, Token, ChangePasswordRequest
from app.core.security import hash_password, verify_password, create_access_token, get_current_user
from app.core import imagekit_client

router = APIRouter(prefix="/auth", tags=["Auth"])

MAX_PROFILE_PICTURE_BYTES = 5 * 1024 * 1024  # 5MB
ALLOWED_PROFILE_PICTURE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@router.post("/register", response_model=UserOut, status_code=201)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(
        (User.username == data.username) | (User.email == data.email)
    ))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username or email already exists")

    user = User(
        name=data.name,
        username=data.username,
        email=data.email,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=Token)
async def login(form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == form.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/change-password", status_code=204)
async def change_password(
    data: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(400, "Current password is incorrect")
    if len(data.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    current_user.hashed_password = hash_password(data.new_password)
    db.add(current_user)
    await db.commit()


@router.post("/profile-picture", response_model=UserOut)
async def upload_profile_picture(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_PROFILE_PICTURE_TYPES:
        raise HTTPException(400, "Only JPEG, PNG, WEBP or GIF images are allowed")

    contents = await file.read()
    if len(contents) > MAX_PROFILE_PICTURE_BYTES:
        raise HTTPException(400, "Image must be smaller than 5MB")

    try:
        url = imagekit_client.upload_profile_picture(contents, file.filename or "profile", current_user.id)
    except RuntimeError as e:
        raise HTTPException(500, str(e))

    current_user.profile_url = url
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user
