# 用户表：单用户阶段库中只有一个用户，结构已支持多用户
# is_active：封禁标记（false 时禁止登录/请求）
# role：角色（user / admin），管理员可访问后台
# is_deleted：匿名化软删除标记（true 时 username 改为 deleted_<id>，password_hash 清空）
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # bcrypt 哈希，绝不存明文
    password_hash: Mapped[str] = mapped_column(String(255))

    # 账号状态：false 表示被封禁（禁止登录/请求）
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # 角色：user（普通用户）/ admin（管理员，可访问后台）
    role: Mapped[str] = mapped_column(String(20), default="user")
    # 匿名化软删除：true 表示已被管理员删除（username 改名、密码清空，数据保留）
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
