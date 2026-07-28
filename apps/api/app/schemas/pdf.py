# PDF 导入：异步任务状态 + 转换草稿模型（与前端对齐）
from typing import Literal

from pydantic import BaseModel


class PdfImportDraft(BaseModel):
    """转换完成的草稿：前端预览编辑后复用 createNote 落库"""
    title: str
    content: str
    suggested_tags: list[str] = []


class PdfJobResult(BaseModel):
    """异步任务状态。done 时 draft 非空；failed 时 error 非空。"""
    job_id: str
    status: Literal["pending", "running", "done", "failed"]
    progress: int = 0      # 已处理页数
    total: int = 0         # 总页数
    draft: PdfImportDraft | None = None
    error: str | None = None


class PdfImportAccepted(BaseModel):
    """POST /api/pdf/import 立即返回：任务已受理"""
    job_id: str
