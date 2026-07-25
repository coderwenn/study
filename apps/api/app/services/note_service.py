# 笔记业务逻辑：全部按 user_id 隔离
# - 受保护笔记禁止删除（含软删除），需先解除保护
# - 软删除：is_deleted=True，移入废纸篓；恢复：is_deleted=False
# - 彻底删除：物理从数据库删除（仍受 is_protected 拦截）
# - 置顶：is_pinned=True，pinned_at 记录时间；多条置顶按 pinned_at 倒序
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from app.models.note import Note
from app.models.tag import Tag
from app.schemas.note import NoteCreate, NoteUpdate


def _snippet(text: str, n: int = 60) -> str:
    """正文摘要：去空白后截断"""
    flat = " ".join(text.split())
    return flat[:n]


def _now() -> datetime:
    """当前 UTC 时间（避免依赖 DB 时区，统一用 Python 端时间戳）"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def list_notes(db: Session, user_id: int) -> list[Note]:
    """
    列出当前用户「未删除」的笔记：
    - 排除已移入废纸篓的笔记（is_deleted=False）；
    - 排序：置顶在前（is_pinned DESC），多条置顶按 pinned_at 倒序，
      非置顶与同置顶时间相同时按 updated_at 倒序。
    """
    stmt = (
        select(Note)
        .where(Note.user_id == user_id, Note.is_deleted == False)  # noqa: E712
        .options(selectinload(Note.tags))
        .order_by(
            Note.is_pinned.desc(),
            Note.pinned_at.desc().nullslast(),
            Note.updated_at.desc(),
        )
    )
    return list(db.scalars(stmt))


def list_trashed_notes(db: Session, user_id: int) -> list[Note]:
    """列出当前用户「废纸篓」中的笔记（按删除时间倒序）"""
    stmt = (
        select(Note)
        .where(Note.user_id == user_id, Note.is_deleted == True)  # noqa: E712
        .options(selectinload(Note.tags))
        .order_by(Note.deleted_at.desc().nullslast(), Note.updated_at.desc())
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
    """部分更新笔记；title/content/is_protected/is_pinned/tag_ids 提供时才更新"""
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
    if data.is_pinned is not None:
        # 置顶/取消置顶：仅在状态变化时更新时间戳，保证多条置顶按最近操作排序
        if data.is_pinned and not note.is_pinned:
            note.is_pinned = True
            note.pinned_at = _now()
        elif not data.is_pinned and note.is_pinned:
            note.is_pinned = False
            note.pinned_at = None
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
    软删除笔记（移入废纸篓），返回操作结果：
      "deleted"    —— 软删除成功
      "protected"  —— 受保护，拒绝删除（需先在编辑器中解除保护）
      "not_found"  —— 不存在或不属于该用户
      "trashed"    —— 已在废纸篓中，无需重复移入
    """
    note = get_note(db, user_id, note_id)
    if note is None:
        return "not_found"
    if note.is_protected:
        return "protected"
    if note.is_deleted:
        # 已在废纸篓：幂等返回，避免重复设置 deleted_at
        return "trashed"
    note.is_deleted = True
    note.deleted_at = _now()
    # 软删除时同步取消置顶：废纸篓中的笔记不再参与正常列表排序
    if note.is_pinned:
        note.is_pinned = False
        note.pinned_at = None
    db.commit()
    return "deleted"


def restore_note(db: Session, user_id: int, note_id: int) -> str:
    """
    从废纸篓恢复笔记，返回操作结果：
      "restored"   —— 恢复成功
      "not_found"  —— 不存在或不属于该用户
      "active"     —— 笔记不在废纸篓中，无需恢复
    """
    note = get_note(db, user_id, note_id)
    if note is None:
        return "not_found"
    if not note.is_deleted:
        return "active"
    note.is_deleted = False
    note.deleted_at = None
    db.commit()
    return "restored"


def purge_note(db: Session, user_id: int, note_id: int) -> str:
    """
    彻底删除笔记（物理删除），返回操作结果：
      "purged"     —— 彻底删除成功
      "protected"  —— 受保护笔记禁止彻底删除（避免误删重要数据）
      "not_found"  —— 不存在或不属于该用户
    说明：彻底删除仅允许针对已进入废纸篓的笔记；活动笔记需先软删除再彻底删除。
    """
    note = get_note(db, user_id, note_id)
    if note is None:
        return "not_found"
    if note.is_protected:
        # 受保护笔记无论是否在废纸篓都禁止彻底删除
        return "protected"
    if not note.is_deleted:
        # 防止误操作：未移入废纸篓的笔记不允许直接彻底删除
        return "protected"
    db.delete(note)
    db.commit()
    return "purged"
