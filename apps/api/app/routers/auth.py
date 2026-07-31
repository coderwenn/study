# 鉴权路由：注册 / 登录 / 刷新 / 当前用户
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.auth import jwt as jwt_utils, security
from app.auth.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, RefreshRequest, TokenPair
from app.schemas.user import UserCreate, UserOut

# 所有鉴权端点统一挂在 /api/auth 前缀下
router = APIRouter(prefix="/api/auth", tags=["auth"])


def _issue_tokens(user: User) -> TokenPair:
    """为指定用户签发一对 access/refresh token"""
    return TokenPair(
        access_token=jwt_utils.create_access_token(user.id),
        refresh_token=jwt_utils.create_refresh_token(user.id),
    )


@router.post("/register", response_model=TokenPair)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    """注册新用户：用户名唯一，成功后返回令牌对与用户信息"""
    # 用户名唯一校验
    exists = db.scalar(select(User).where(User.username == payload.username))
    if exists:
        raise HTTPException(status_code=409, detail="用户名已被占用")
    user = User(
        username=payload.username,
        password_hash=security.hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    tokens = _issue_tokens(user)
    # 注册后附带用户信息（自定义返回，含 user 字段）
    return {
        "access_token": tokens.access_token,
        "refresh_token": tokens.refresh_token,
        "token_type": "bearer",
        "user": UserOut.model_validate(user).model_dump(),
    }


@router.post("/login", response_model=TokenPair)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """
    登录校验：用户名存在且密码匹配，成功后返回令牌对。
    - 被封禁（is_active=false）的用户返回 403
    - 已删除（is_deleted=true）的用户返回 401（不暴露存在性）
    """
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not security.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if user.is_deleted:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="账号已被封禁")
    return _issue_tokens(user)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    """用 refresh token 换取新的令牌对"""
    try:
        data = jwt_utils.decode_token(payload.refresh_token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="refresh token 无效")
    if data.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="token 类型错误")
    user = db.get(User, int(data["sub"]))
    if user is None:
        raise HTTPException(status_code=401, detail="用户不存在")
    return _issue_tokens(user)


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    """返回当前登录用户信息（需要有效的 access token）"""
    return current
