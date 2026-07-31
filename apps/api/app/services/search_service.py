# 全文搜索：基于 PostgreSQL pg_trgm（ILIKE 子串匹配），按用户隔离，排除已删除（废纸篓）笔记
# - pg_trgm 的 GIN 索引对任意长度子串均生效，无需短查询回退逻辑
# - 与原 SQLite fts5(trigram) 行为对齐：标题/正文子串匹配
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from app.models.note import Note


def search_notes(db: Session, user_id: int, query: str) -> list[Note]:
    """
    在当前用户「未删除」笔记的标题/正文中做子串匹配，按更新时间倒序。
    - 通过 n.is_deleted = False 过滤废纸篓中的笔记
    - pg_trgm GIN 索引自动加速 ILIKE，无需手动指定索引
    - 排序按 updated_at（相关度排序在 PG 上需额外配置，暂用时间排序保持简单）
    """
    like_pattern = f"%{query}%"
    stmt = (
        select(Note)
        .where(
            Note.user_id == user_id,
            Note.is_deleted == False,  # noqa: E712
            Note.title.ilike(like_pattern) | Note.content.ilike(like_pattern),
        )
        .options(selectinload(Note.tags))
        .order_by(Note.updated_at.desc())
    )
    return list(db.scalars(stmt))
