# 全文搜索：基于 FTS5(trigram)，按用户隔离
from sqlalchemy import select, text
from sqlalchemy.orm import Session, selectinload
from app.models.note import Note

# trigram 分词器要求 MATCH 查询至少 3 个字符，否则无法匹配；
# 对过短的关键词（如中文双字词「路由」）回退到 LIKE 子串匹配。
_TRIGRAM_MIN_LEN = 3


def search_notes(db: Session, user_id: int, query: str) -> list[Note]:
    """在当前用户笔记的标题/正文中做子串匹配，按相关度排序"""
    if len(query) >= _TRIGRAM_MIN_LEN:
        # 通过 notes_fts MATCH 做子串匹配（trigram 分词器），JOIN notes 表后过滤用户
        stmt = text(
            """
            SELECT n.id
            FROM notes n
            JOIN notes_fts f ON f.note_id = n.id
            WHERE n.user_id = :uid AND notes_fts MATCH :q
            ORDER BY rank
            """
        )
        rows = db.execute(stmt, {"uid": user_id, "q": query}).all()
    else:
        # 短查询回退：在标题/正文中做 LIKE 子串匹配
        like = f"%{query}%"
        stmt = text(
            """
            SELECT n.id
            FROM notes n
            WHERE n.user_id = :uid
              AND (n.title LIKE :like OR n.content LIKE :like)
            """
        )
        rows = db.execute(stmt, {"uid": user_id, "like": like}).all()
    ids = [r[0] for r in rows]
    if not ids:
        return []
    # 按 ids 顺序取出完整 ORM 对象（带 tags）
    notes_by_id = {
        n.id: n
        for n in db.scalars(
            select(Note)
            .where(Note.id.in_(ids))
            .options(selectinload(Note.tags))
        )
    }
    return [notes_by_id[i] for i in ids]
