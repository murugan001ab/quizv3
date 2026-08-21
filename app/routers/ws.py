import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError, jwt
from sqlalchemy import select
from app.core.security import SECRET_KEY, ALGORITHM
from app.database import AsyncSessionLocal
from app.models.user import User
from app.ws_manager import manager

router = APIRouter(tags=["WebSocket"])


def _verify_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


async def _is_admin(payload: dict) -> bool:
    """A valid JWT only proves *who* the user is, not that they're an admin —
    is_admin isn't in the token, so it must be checked against the DB."""
    user_id = payload.get("sub")
    if user_id is None:
        return False
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return False
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        return bool(user and user.is_admin)


@router.websocket("/ws/admin")
async def admin_ws(
    websocket: WebSocket,
    token: str = Query(...)
):
    payload = _verify_token(token)

    if not payload or not await _is_admin(payload):
        await websocket.close(code=1008)
        return

    await manager.connect(websocket)

    try:
        while True:
            await asyncio.sleep(30)

            await websocket.send_json({
                "type": "ping"
            })

    except WebSocketDisconnect:
        manager.disconnect(websocket)