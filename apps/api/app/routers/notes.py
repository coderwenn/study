# 笔记路由：CRUD，受保护笔记删除返回 403，越权返回 404
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.auth.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.note import NoteCreate, NoteListItem, NoteOut, NoteUpdate
from app.services import note_service

router = APIRouter(prefix="/api/notes", tags=["notes"])


def _to_list_item(note) -> dict:
    """将笔记转换为列表项 dict（含摘要，不含完整正文）"""
    from app.services.note_service import _snippet
    return {
        "id": note.id,
        "title": note.title,
        "snippet": _snippet(note.content),
        "is_protected": note.is_protected,
        "updated_at": note.updated_at,
        "tags": [{"id": t.id, "name": t.name} for t in note.tags],
    }


@router.get("/", response_model=list[NoteListItem])
def list_notes(
    q: str | None = None,        # 关键词搜索（Task 12 实现）
    tag: int | None = None,      # 按标签 id 过滤
    page: int = 1,               # 页码（从 1 开始）
    limit: int = 20,             # 每页数量
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """列出当前用户的笔记（列表项含摘要），支持搜索、标签过滤与分页"""
    if q:
        # 搜索委托给 search_service（Task 12 实现，此处懒加载避免在未提供 q 时导入）
        from app.services.search_service import search_notes
        notes = search_notes(db, user.id, q)
    else:
        notes = note_service.list_notes(db, user.id)
    # 标签过滤
    if tag is not None:
        notes = [n for n in notes if any(t.id == tag for t in n.tags)]
    # 分页
    start = (page - 1) * limit
    return [_to_list_item(n) for n in notes[start:start + limit]]


@router.post("/", response_model=NoteOut, status_code=200)
def create_note(
    payload: NoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """创建新笔记"""
    return note_service.create_note(db, user.id, payload)


@router.get("/{note_id}", response_model=NoteOut)
def get_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """按 id 获取笔记详情；不存在或不属于当前用户返回 404"""
    note = note_service.get_note(db, user.id, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="笔记不存在")
    return note


@router.put("/{note_id}", response_model=NoteOut)
def update_note(
    note_id: int,
    payload: NoteUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """部分更新笔记；不存在或不属于当前用户返回 404"""
    note = note_service.update_note(db, user.id, note_id, payload)
    if note is None:
        raise HTTPException(status_code=404, detail="笔记不存在")
    return note


@router.delete("/{note_id}", status_code=204)
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """删除笔记；受保护返回 403，不存在返回 404"""
    result = note_service.delete_note(db, user.id, note_id)
    if result == "not_found":
        raise HTTPException(status_code=404, detail="笔记不存在")
    if result == "protected":
        raise HTTPException(status_code=403, detail="该笔记已设为保护，无法删除")
    return None
