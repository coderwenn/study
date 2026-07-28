# PDF 导入路由：异步任务，转 MD 草稿（不落库）。
# POST /api/pdf/import → 立即返回 job_id；GET /api/pdf/jobs/{id} → 轮询状态/草稿。
# 413 过大 / 422 页数超限 / 429 已有任务进行中 / 400 非 PDF / 404 任务不存在或非本人
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.auth.deps import get_current_user
from app.models.user import User
from app.schemas.pdf import PdfImportAccepted, PdfJobResult
from app.services import pdf_import_service as svc

router = APIRouter(prefix="/api", tags=["pdf"])


@router.post("/pdf/import", response_model=PdfImportAccepted)
async def import_pdf(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """上传 PDF，后台异步转 MD，立即返回 job_id。详见 CONTEXT.md / 设计概览。"""
    data = await file.read()
    if not data:
        raise HTTPException(400, "文件为空")
    try:
        job_id = svc.create_job(user.id, file.filename or "upload.pdf", data)
    except svc.PdfImportError as e:
        code = {
            "too_large": 413,
            "too_many_pages": 422,
            "busy": 429,
            "invalid": 400,
        }.get(e.kind, 400)
        raise HTTPException(code, str(e)) from e
    return PdfImportAccepted(job_id=job_id)


@router.get("/pdf/jobs/{job_id}", response_model=PdfJobResult)
def get_job(job_id: str, user: User = Depends(get_current_user)):
    """轮询导入任务状态。done 时返回草稿；非本人或不存在 → 404。"""
    job = svc.get_job(job_id, user.id)
    if job is None:
        raise HTTPException(404, "任务不存在或已过期")
    return PdfJobResult(**job)
