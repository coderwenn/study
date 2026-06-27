# 笔记业务逻辑：全部按 user_id 隔离，受保护笔记禁止删除
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from app.models.note import Note
from app.models.tag import Tag
from app.schemas.note import NoteCreate, NoteUpdate


def _snippet(text: str, n: int = 60) -> str:
    """正文摘要：去空白后截断"""
    flat = " ".join(text.split())
    return flat[:n]


def list_notes(db: Session, user_id: int) -> list[Note]:
    """列出当前用户的所有笔记（按更新时间倒序），含标签"""
    stmt = (
        select(Note)
        .where(Note.user_id == user_id)
        .options(selectinload(Note.tags))
        .order_by(Note.updated_at.desc())
    )
    return list(db.scalars(stmt))


def get_note(db: Session, user_id: int, note_id: int) -> Note | None:
    """按 id 取笔记，强制 user_id 隔离；不存在或不属于该用户返回 None"""
    stmt = (
        select(Note)
        .where(Note.id == note_id, Note.user_id == user_id)
        .options(selectinload(Note.tags))
    )
    return db.scalar(stmt)


def create_note(db: Session, user_id: int, data: NoteCreate) -> Note:
    """创建笔记；tag_ids 只能引用属于当前用户的标签"""
    note = Note(
        user_id=user_id,
        title=data.title,
        content=data.content,
        is_protected=data.is_protected,
    )
    if data.tag_ids:
        # 只能引用属于当前用户的标签
        note.tags = list(
            db.scalars(
                select(Tag).where(Tag.id.in_(data.tag_ids), Tag.user_id == user_id)
            )
        )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def update_note(db: Session, user_id: int, note_id: int, data: NoteUpdate) -> Note | None:
    """部分更新笔记；只有 title/content/is_protected/tag_ids 提供时才更新"""
    note = get_note(db, user_id, note_id)
    if note is None:
        return None
    if data.title is not None and data.title != note.title:
        note.title = data.title
    if data.content is not None and data.content != note.content:
        note.content = data.content
        # 只有内容变化才更新 updated_at（由 onupdate 自动处理）
    if data.is_protected is not None:
        note.is_protected = data.is_protected
    if data.tag_ids is not None:
        # 整体替换标签关联，仅限当前用户拥有的标签
        note.tags = list(
            db.scalars(
                select(Tag).where(Tag.id.in_(data.tag_ids), Tag.user_id == user_id)
            )
        )
    db.commit()
    db.refresh(note)
    return note


def delete_note(db: Session, user_id: int, note_id: int) -> str:
    """
    删除笔记，返回操作结果：
      "deleted"    —— 删除成功
      "protected"  —— 受保护，拒绝删除
      "not_found"  —— 不存在或不属于该用户
    """
    note = get_note(db, user_id, note_id)
    if note is None:
        return "not_found"
    if note.is_protected:
        return "protected"
    db.delete(note)
    db.commit()
    return "deleted"
