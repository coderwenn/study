# 鉴权依赖：从请求头解析 JWT，返回当前用户
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
    """解析 access token 并返回用户对象"""
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
    return user
