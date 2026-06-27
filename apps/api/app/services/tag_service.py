# 标签业务逻辑：按用户隔离，(user_id, name) 唯一
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.models.note import note_tags
from app.models.tag import Tag


def list_tags(db: Session, user_id: int) -> list[dict]:
    """返回当前用户的全部标签及各自动态笔记数"""
    stmt = select(Tag).where(Tag.user_id == user_id).order_by(Tag.name)
    tags = list(db.scalars(stmt))
    # 统计每个标签的笔记数（按 tag_id 分组计数）
    counts: dict[int, int] = {}
    if tags:
        count_stmt = (
            select(note_tags.c.tag_id, func.count())
            .where(note_tags.c.tag_id.in_([t.id for t in tags]))
            .group_by(note_tags.c.tag_id)
        )
        counts = {tid: cnt for tid, cnt in db.execute(count_stmt)}
    return [
        {"id": t.id, "name": t.name, "note_count": counts.get(t.id, 0)} for t in tags
    ]


def create_tag(db: Session, user_id: int, name: str) -> Tag:
    """创建标签；同一用户下同名标签已存在则返回 409"""
    exists = db.scalar(select(Tag).where(Tag.user_id == user_id, Tag.name == name))
    if exists:
        raise HTTPException(status_code=409, detail="标签名已存在")
    tag = Tag(user_id=user_id, name=name)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def delete_tag(db: Session, user_id: int, tag_id: int) -> bool:
    """
    删除当前用户拥有的标签；
    关联表 note_tags 通过 ondelete CASCADE 自动解除关联。
    返回 True 表示已删除，False 表示不存在或不属于该用户。
    """
    tag = db.scalar(select(Tag).where(Tag.id == tag_id, Tag.user_id == user_id))
    if tag is None:
        return False
    db.delete(tag)  # 关联表 ondelete CASCADE 自动解除
    db.commit()
    return True
