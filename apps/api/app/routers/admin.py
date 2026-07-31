# 管理后台路由：供 Spring Boot 后台调用，通过 X-Admin-Key 鉴权
# - notes：软删除指定用户的笔记（复用 note_service，保持业务规则一致）
# - tags：删除指定用户的标签（复用 tag_service）
# - users：重置密码（复用 security 哈希逻辑）
#
# 设计要点：
#   1. 所有路由挂 /api/admin 前缀，统一 verify_admin_api_key 依赖
#   2. 通过 ?user_id=X 查询参数指定操作哪个用户的资源（复用现有 service 方法）
#   3. 不做 user_id 隔离——admin 可跨用户操作，但 service 方法内部仍带 user_id 过滤
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.auth.deps import verify_admin_api_key
from app.database import get_db
from app.models.user import User
from app.schemas.user import AdminResetPasswordRequest
from app.services import note_service, tag_service
from app.auth import security

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(verify_admin_api_key)],
)


@router.delete("/notes/{note_id}", status_code=204)
def admin_delete_note(
    note_id: int,
    user_id: int = Query(..., description="笔记所属用户 ID"),
    db: Session = Depends(get_db),
):
    """
    管理员软删除指定用户的笔记（移入废纸篓）。
    - 复用 note_service.delete_note，联动取消置顶、受保护校验等规则自动执行
    - 受保护笔记返回 403（需用户自己解除保护后管理员才能删）
    - 不存在返回 404
    """
    result = note_service.delete_note(db, user_id, note_id)
    if result == "not_found":
        raise HTTPException(status_code=404, detail="笔记不存在")
    if result == "protected":
        raise HTTPException(status_code=403, detail="该笔记已设为保护，无法删除")
    return None


@router.delete("/tags/{tag_id}", status_code=204)
def admin_delete_tag(
    tag_id: int,
    user_id: int = Query(..., description="标签所属用户 ID"),
    db: Session = Depends(get_db),
):
    """
    管理员删除指定用户的标签。
    - 复用 tag_service.delete_tag，关联表 note_tags 自动 CASCADE 解除
    - 不存在返回 404
    """
    ok = tag_service.delete_tag(db, user_id, tag_id)
    if not ok:
        raise HTTPException(status_code=404, detail="标签不存在")
    return None


@router.post("/users/{user_id}/reset-password", status_code=200)
def admin_reset_password(
    user_id: int,
    payload: AdminResetPasswordRequest,
    db: Session = Depends(get_db),
):
    """
    管理员重置用户密码。
    - 用 passlib bcrypt 哈希新密码（与注册/登录同一套逻辑）
    - 用户不存在返回 404
    - 返回 200（不返回密码明文，由管理员告知用户）
    """
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.password_hash = security.hash_password(payload.new_password)
    db.commit()
    return {"status": "ok"}
