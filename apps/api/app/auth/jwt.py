# JWT 签发与解析：access token 短期、refresh token 长期
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from app.config import settings


def _create_token(subject: str, expires_delta: timedelta, token_type: str) -> str:
    """构造 payload 并签发 JWT"""
    payload: dict[str, Any] = {
        # sub: 主题（用户标识）
        "sub": subject,
        # type: token 类型（access / refresh）
        "type": token_type,
        # exp: 过期时间（UTC）
        "exp": datetime.now(timezone.utc) + expires_delta,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_access_token(user_id: int) -> str:
    """签发短期 access token（分钟级）"""
    return _create_token(
        str(user_id),
        timedelta(minutes=settings.access_token_expire_minutes),
        "access",
    )


def create_refresh_token(user_id: int) -> str:
    """签发长期 refresh token（天级）"""
    return _create_token(
        str(user_id),
        timedelta(days=settings.refresh_token_expire_days),
        "refresh",
    )


def decode_token(token: str) -> dict[str, Any]:
    """解析并校验签名/过期；失败抛 jwt 异常"""
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
