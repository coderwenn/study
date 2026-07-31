import os

# 测试环境强制用内存 SQLite，避免模块级 engine 尝试连接 PostgreSQL
os.environ["DATABASE_URL"] = "sqlite://"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base, get_db
from app.main import app as fastapi_app  # FastAPI 实例（避免被下方 import app.models 遮蔽）
import app.models  # noqa: F401  确保模型注册


@pytest.fixture()
def client():
    # 内存 SQLite + StaticPool 保持单连接，使事务在测试内一致
    # 注意：search_service 用 ILIKE，SQLite 的 LIKE 大小写不敏感（ASCII），行为一致
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    # 无需建 FTS 虚拟表——search_service 已改为 ILIKE 直接查列

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    fastapi_app.dependency_overrides[get_db] = override_get_db
    with TestClient(fastapi_app) as c:
        yield c
    fastapi_app.dependency_overrides.clear()
