# 鉴权依赖：从请求头解析 JWT，返回当前用户
# - 检查用户是否存在、是否被封禁（is_active）、是否被删除（is_deleted）
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.auth import jwt as jwt_utils
from app.database import get_db
from app.models.user import User

# tokenUrl 仅作文档展示用，前端实际走 /api/auth/login
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """解析 access token 并返回用户对象；校验用户状态（封禁/删除）"""
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭证",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt_utils.decode_token(token)
    except jwt.PyJWTError:
        raise cred_exc
    if payload.get("type") != "access":
        raise cred_exc
    user_id = payload.get("sub")
    if user_id is None:
        raise cred_exc
    user = db.get(User, int(user_id))
    if user is None:
        raise cred_exc
    # 被封禁或已删除的用户拒绝访问
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账号已被封禁",
        )
    if user.is_deleted:
        raise cred_exc
    return user


# ── 管理后台服务间鉴权 ──
# Spring Boot 后台调用 /api/admin/* 时通过 X-Admin-Key 头携带密钥
from fastapi import Header
from app.config import settings


def verify_admin_api_key(x_admin_key: str = Header(default="")) -> None:
    """
    校验管理后台服务间密钥。
    - 密钥不匹配或未配置时返回 403
    - 用于所有 /api/admin/* 路由
    """
    if not settings.admin_api_key or x_admin_key != settings.admin_api_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无管理后台访问权限",
        )
