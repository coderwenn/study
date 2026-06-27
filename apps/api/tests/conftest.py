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
    # 内存 SQLite + StaticPool 保持单连接，使 FTS/事务在测试内一致
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    # 建立搜索用的 FTS 表与触发器（与 init_db 保持一致）
    from app.database import _FTS_SQL
    with engine.begin() as conn:
        for stmt in _FTS_SQL:
            conn.exec_driver_sql(stmt)

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
