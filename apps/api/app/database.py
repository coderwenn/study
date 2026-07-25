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


def _migrate_notes_table(conn) -> None:
    """
    幂等迁移：为 notes 表追加废纸篓 / 置顶相关列。
    - SQLite 不支持 ADD COLUMN IF NOT EXISTS，故先查 PRAGMA table_info 判断列是否存在；
    - 新增列均带默认值，旧行自动填默认值，不影响现有数据。
    """
    # 取出 notes 表当前所有列名
    existing_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(notes)").fetchall()}
    # 待补齐的列：(列名, DDL 片段)
    pending = [
        ("is_deleted", "BOOLEAN NOT NULL DEFAULT 0"),
        ("deleted_at", "DATETIME"),
        ("is_pinned", "BOOLEAN NOT NULL DEFAULT 0"),
        ("pinned_at", "DATETIME"),
    ]
    for col_name, ddl in pending:
        if col_name not in existing_cols:
            conn.exec_driver_sql(f"ALTER TABLE notes ADD COLUMN {col_name} {ddl}")


def init_db() -> None:
    """开发环境：创建所有表 + FTS 索引 + 幂等迁移。生产应使用 Alembic 迁移。"""
    Base.metadata.create_all(bind=engine)
    # 必须在 notes 表存在之后执行（触发器引用 notes 表）
    with engine.begin() as conn:
        # 先做表结构迁移（新增列），再建 FTS 与触发器
        _migrate_notes_table(conn)
        for stmt in _FTS_SQL:
            conn.exec_driver_sql(stmt)
