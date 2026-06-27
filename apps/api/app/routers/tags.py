# 标签路由：增删查，全部按当前用户隔离
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.auth.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.tag import TagCreate, TagOut
from app.services import tag_service

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("/", response_model=list[TagOut])
def list_tags(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """列出当前用户的全部标签（含动态笔记数）"""
    return tag_service.list_tags(db, user.id)


@router.post("/", response_model=TagOut, status_code=200)
def create_tag(
    payload: TagCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """创建标签；同名已存在返回 409"""
    return tag_service.create_tag(db, user.id, payload.name)


@router.delete("/{tag_id}", status_code=204)
def delete_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """删除标签；不存在或不属于当前用户返回 404"""
    ok = tag_service.delete_tag(db, user.id, tag_id)
    if not ok:
        raise HTTPException(status_code=404, detail="标签不存在")
    return None
