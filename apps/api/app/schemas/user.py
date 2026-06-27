# 用户相关 Pydantic 模型
from datetime import datetime
from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6)


class UserOut(BaseModel):
    id: int
    username: str
    email: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
