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


# FTS5（trigram 分词，支持中文子串匹配）虚拟表 + 同步触发器
# - note_id UNINDEXED：只存外键值，不为其建索引
# - title, content：进入全文索引的列
# - 三个触发器保持 notes_fts 与 notes 表同步（增/删/改）
# 注意：pysqlite 一次只能执行一条语句，故拆分为列表逐条执行
_FTS_SQL = [
    """
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        note_id UNINDEXED, title, content, tokenize='trigram'
    )
    """,
    """
    CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
        INSERT INTO notes_fts(note_id, title, content) VALUES (new.id, new.title, new.content);
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
        DELETE FROM notes_fts WHERE note_id = old.id;
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
        DELETE FROM notes_fts WHERE note_id = old.id;
        INSERT INTO notes_fts(note_id, title, content) VALUES (new.id, new.title, new.content);
    END
    """,
]


def init_db() -> None:
    """开发环境：创建所有表 + FTS 索引。生产应使用 Alembic 迁移。"""
    Base.metadata.create_all(bind=engine)
    # 必须在 notes 表存在之后执行（触发器引用 notes 表）
    with engine.begin() as conn:
        for stmt in _FTS_SQL:
            conn.exec_driver_sql(stmt)
