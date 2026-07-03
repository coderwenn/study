# Wiki 发布路由：把笔记作为「来源」写进 llm-wiki 的 entries/
# 仅 owner 可发；未配置（WIKI_ENTRIES_PATH/WIKI_OWNER 为空）返回 503
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.services import note_service, wiki_publish_service

router = APIRouter(prefix="/api/notes", tags=["wiki"])


@router.post("/{note_id}/wiki")
def publish_note_to_wiki(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """把笔记发布为 Wiki Source（仅 owner；未配置返回 503；越权返回 404）"""
    # 1) 功能开关：path 或 owner 任一未配置 → 503
    if not settings.wiki_entries_path or not settings.wiki_owner:
        raise HTTPException(
            status_code=503, detail="Wiki 未配置（需设置 WIKI_ENTRIES_PATH 与 WIKI_OWNER）"
        )
    # 2) 仅 owner 可发布
    if user.username != settings.wiki_owner:
        raise HTTPException(status_code=403, detail="仅 Wiki owner 可发布")
    # 3) 取笔记（强制 user_id 隔离；不存在或不属于该用户 → 404）
    note = note_service.get_note(db, user.id, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="笔记不存在")
    # 4) 写文件
    try:
        return wiki_publish_service.publish_note(note)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"写入 Wiki 失败：{e}")
