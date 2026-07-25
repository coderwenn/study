# 笔记路由：CRUD + 废纸篓 + 置顶，受保护笔记删除返回 403，越权返回 404
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.auth.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.note import (
    NoteCreate,
    NoteListItem,
    NoteOut,
    NoteUpdate,
    TrashListItem,
)
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
        "is_pinned": note.is_pinned,
        "pinned_at": note.pinned_at,
        "updated_at": note.updated_at,
        "tags": [{"id": t.id, "name": t.name} for t in note.tags],
    }


def _to_trash_item(note) -> dict:
    """将笔记转换为废纸篓列表项 dict（含删除时间，不含置顶字段）"""
    from app.services.note_service import _snippet
    return {
        "id": note.id,
        "title": note.title,
        "snippet": _snippet(note.content),
        "is_protected": note.is_protected,
        "deleted_at": note.deleted_at,
        "updated_at": note.updated_at,
        "tags": [{"id": t.id, "name": t.name} for t in note.tags],
    }


@router.get("/", response_model=list[NoteListItem])
def list_notes(
    q: str | None = None,        # 关键词搜索
    tag: int | None = None,      # 按标签 id 过滤
    page: int = 1,               # 页码（从 1 开始）
    limit: int = 20,             # 每页数量
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """列出当前用户「未删除」笔记（列表项含摘要），置顶优先，支持搜索、标签过滤与分页"""
    if q:
        # 搜索委托给 search_service（已排除已删除笔记），此处懒加载避免在未提供 q 时导入
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


@router.get("/trash/", response_model=list[TrashListItem])
def list_trash(
    page: int = 1,               # 页码（从 1 开始）
    limit: int = 50,            # 每页数量，废纸篓默认更大
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """列出当前用户废纸篓中的笔记（按删除时间倒序）"""
    notes = note_service.list_trashed_notes(db, user.id)
    start = (page - 1) * limit
    return [_to_trash_item(n) for n in notes[start:start + limit]]


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
    """部分更新笔记（支持 title/content/is_protected/is_pinned/tag_ids）；不存在返回 404"""
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
    """
    软删除笔记（移至废纸篓）：
      - 受保护笔记返回 403，需先解除保护
      - 不存在或不属于当前用户返回 404
      - 已在废纸篓中幂等返回 204
    """
    result = note_service.delete_note(db, user.id, note_id)
    if result == "not_found":
        raise HTTPException(status_code=404, detail="笔记不存在")
    if result == "protected":
        raise HTTPException(status_code=403, detail="该笔记已设为保护，无法删除")
    # "deleted" 与 "trashed" 均返回 204
    return None


@router.post("/{note_id}/restore", response_model=NoteOut)
def restore_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    从废纸篓恢复笔记：
      - 不存在返回 404
      - 不在废纸篓中幂等返回当前笔记
    """
    result = note_service.restore_note(db, user.id, note_id)
    if result == "not_found":
        raise HTTPException(status_code=404, detail="笔记不存在")
    # 恢复后重新取最新数据返回
    note = note_service.get_note(db, user.id, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="笔记不存在")
    return note


@router.delete("/{note_id}/purge", status_code=204)
def purge_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    彻底删除笔记（物理删除）：
      - 受保护笔记返回 403
      - 不存在返回 404
      - 未进入废纸篓的笔记禁止直接彻底删除（返回 403，提示先移入废纸篓）
    """
    result = note_service.purge_note(db, user.id, note_id)
    if result == "not_found":
        raise HTTPException(status_code=404, detail="笔记不存在")
    if result == "protected":
        raise HTTPException(
            status_code=403,
            detail="该笔记受保护或未进入废纸篓，无法彻底删除",
        )
    return None


@router.post("/{note_id}/pin", response_model=NoteOut)
def pin_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """置顶笔记：标记为置顶并记录时间，幂等可重复调用"""
    note = note_service.update_note(db, user.id, note_id, NoteUpdate(is_pinned=True))
    if note is None:
        raise HTTPException(status_code=404, detail="笔记不存在")
    return note


@router.post("/{note_id}/unpin", response_model=NoteOut)
def unpin_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """取消置顶：清除置顶标记与时间，幂等可重复调用"""
    note = note_service.update_note(db, user.id, note_id, NoteUpdate(is_pinned=False))
    if note is None:
        raise HTTPException(status_code=404, detail="笔记不存在")
    return note
