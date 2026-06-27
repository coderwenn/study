from app.database import Base, engine, get_db


def test_get_db_yields_usable_session():
    gen = get_db()
    db = next(gen)
    assert db is not None  # 会话对象创建成功即可
    gen.close()


def test_engine_and_base_exist():
    assert engine is not None
    assert Base is not None
