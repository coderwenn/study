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
    is_active: bool = True
    role: str = "user"
    is_deleted: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


# ── 管理后台：重置密码 ──
class AdminResetPasswordRequest(BaseModel):
    """管理员重置用户密码的请求体"""
    new_password: str = Field(min_length=6)
