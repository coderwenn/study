# 全文搜索：基于 FTS5(trigram)，按用户隔离，排除已删除（废纸篓）笔记
from sqlalchemy import select, text
from sqlalchemy.orm import Session, selectinload
from app.models.note import Note

# trigram 分词器要求 MATCH 查询至少 3 个字符，否则无法匹配；
# 对过短的关键词（如中文双字词「路由」）回退到 LIKE 子串匹配。
_TRIGRAM_MIN_LEN = 3


def search_notes(db: Session, user_id: int, query: str) -> list[Note]:
    """
    在当前用户「未删除」笔记的标题/正文中做子串匹配，按相关度排序。
    - 通过 n.is_deleted = 0 过滤废纸篓中的笔记
    - 排序保持搜索相关度优先，置顶/时间排序由调用方在列表层处理
      （搜索场景相关度更重要，保留 FTS rank 顺序）
    """
    if len(query) >= _TRIGRAM_MIN_LEN:
        # 通过 notes_fts MATCH 做子串匹配（trigram 分词器），JOIN notes 表后过滤用户与未删除
        stmt = text(
            """
            SELECT n.id
            FROM notes n
            JOIN notes_fts f ON f.note_id = n.id
            WHERE n.user_id = :uid
              AND n.is_deleted = 0
              AND notes_fts MATCH :q
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
              AND n.is_deleted = 0
              AND (n.title LIKE :like OR n.content LIKE :like)
            ORDER BY n.updated_at DESC
            """
        )
        rows = db.execute(stmt, {"uid": user_id, "like": like}).all()
    ids = [r[0] for r in rows]
    if not ids:
        return []
    # 按 ids 顺序取出完整 ORM 对象（带 tags），并再次过滤已删除（双保险，防止极端并发）
    notes_by_id = {
        n.id: n
        for n in db.scalars(
            select(Note)
            .where(Note.id.in_(ids), Note.is_deleted == False)  # noqa: E712
            .options(selectinload(Note.tags))
        )
    }
    return [notes_by_id[i] for i in ids if i in notes_by_id]
