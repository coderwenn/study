# 数据库引擎、会话工厂、声明式基类、依赖与会话初始化
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.config import settings


# PostgreSQL 不需要 check_same_thread（SQLite 专有参数）
_connect_args = {}
if settings.database_url.startswith("sqlite"):
    # SQLite 需要 check_same_thread=False（FastAPI 多线程使用）
    _connect_args = {"check_same_thread": False}

engine = create_engine(settings.database_url, connect_args=_connect_args, echo=False)
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


# 全文搜索：PostgreSQL 使用 pg_trgm 扩展 + GIN 索引（子串匹配，中文友好）
# - 与原 SQLite fts5(tokenize='trigram') 行为对齐
# - search_service 用 ILIKE 查询，GIN 索引自动加速
# 注意：pg_trgm 是 PG 扩展，需要超级用户或已授权用户创建一次
_PG_TRGM_SQL = [
    "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    # title 列 GIN 索引
    "CREATE INDEX IF NOT EXISTS idx_notes_title_trgm ON notes USING gin (title gin_trgm_ops)",
    # content 列 GIN 索引
    "CREATE INDEX IF NOT EXISTS idx_notes_content_trgm ON notes USING gin (content gin_trgm_ops)",
]


def init_db(engine=None) -> None:
    """
    建表 + 全文搜索索引 + 幂等迁移（补齐旧库缺失列）。
    - engine=None 时用全局 engine（开发环境 / FastAPI lifespan 调用）
    - 传入 engine 时用指定引擎（迁移脚本调用）
    """
    target = engine or _engine_local()
    Base.metadata.create_all(bind=target)
    url = str(target.url)
    if url.startswith("sqlite"):
        # SQLite 旧库幂等补列（PRAGMA 查列名，缺失则 ALTER TABLE ADD COLUMN）
        _migrate_sqlite(target)
    else:
        # PostgreSQL: pg_trgm 扩展 + GIN 索引
        with target.begin() as conn:
            for stmt in _PG_TRGM_SQL:
                conn.execute(text(stmt))


def _migrate_sqlite(engine) -> None:
    """
    SQLite 幂等迁移：为旧库补齐 users 表新增的列。
    - SQLite 不支持 ADD COLUMN IF NOT EXISTS，故先查 PRAGMA table_info 判断；
    - 新增列均带默认值，旧行自动填默认值，不影响现有数据。
    """
    _sqlite_migrations = {
        "users": [
            ("is_active", "BOOLEAN NOT NULL DEFAULT 1"),
            ("role", "VARCHAR(20) NOT NULL DEFAULT 'user'"),
            ("is_deleted", "BOOLEAN NOT NULL DEFAULT 0"),
        ],
        # notes 表的废纸篓/置顶字段（已有旧库可能也缺这几列）
        "notes": [
            ("is_deleted", "BOOLEAN NOT NULL DEFAULT 0"),
            ("deleted_at", "DATETIME"),
            ("is_pinned", "BOOLEAN NOT NULL DEFAULT 0"),
            ("pinned_at", "DATETIME"),
        ],
    }
    with engine.begin() as conn:
        for table_name, columns in _sqlite_migrations.items():
            existing = {row[1] for row in conn.exec_driver_sql(
                f"PRAGMA table_info({table_name})"
            ).fetchall()}
            for col_name, ddl in columns:
                if col_name not in existing:
                    conn.exec_driver_sql(
                        f"ALTER TABLE {table_name} ADD COLUMN {col_name} {ddl}"
                    )


def _engine_local():
    """返回模块级 engine（init_db 默认参数延迟引用，避免循环导入）"""
    return engine
