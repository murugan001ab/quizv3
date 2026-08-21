from typing import Optional

from pydantic import BaseModel


class LiveChannelCreate(BaseModel):
    name: str
    quiz_id: int
    password: Optional[str] = None
    time_per_question: int = 20


class LiveChannelOut(BaseModel):
    code: str
    name: str
    locked: bool
    quiz_id: int
    quiz_title: str
    link_token:str


class LiveChannelSummary(BaseModel):
    code: str
    name: str
    locked: bool
    quiz_id: int
    quiz_title: str
    participant_count: int
    state: str
    admin_user_id: int
