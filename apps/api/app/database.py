# 数据库引擎、会话工厂、声明式基类、依赖与会话初始化
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.config import settings

# SQLite 需要 check_same_thread=False（FastAPI 多线程使用）
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, echo=False)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """所有 ORM 模型的声明式基类"""
    pass


def get_db():
    """FastAPI 依赖：提供数据库会话并在请求结束后关闭"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """开发环境：创建所有表。生产应使用 Alembic 迁移。"""
    Base.metadata.create_all(bind=engine)
