# 登录/令牌相关 Pydantic 模型
from pydantic import BaseModel
from app.schemas.user import UserOut


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut | None = None  # register 时附带


class RefreshRequest(BaseModel):
    refresh_token: str
