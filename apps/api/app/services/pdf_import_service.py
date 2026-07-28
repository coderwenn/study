# PDF 导入服务：pymupdf 抽文本/渲染图 + rapidocr OCR + 内存任务表 + 线程池。
# 异步：create_job 提交后立即返回 job_id，_run_job 在线程池内逐页处理，前端轮询 get_job。
# 单 worker 部署下内存任务表安全；不存原文件（转完即弃，与 Summarize 无状态哲学一致）。
import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import pymupdf

from app.config import settings


class PdfImportError(Exception):
    """入口校验错误（映射到 4xx）。kind: invalid/too_large/too_many_pages/busy"""
    def __init__(self, message: str, kind: str = "invalid"):
        super().__init__(message)
        self.kind = kind


@dataclass
class _Job:
    """单个导入任务的状态（进程内内存态）"""
    job_id: str
    user_id: int
    status: str = "pending"       # pending/running/done/failed
    progress: int = 0             # 已处理页数
    total: int = 0                # 总页数
    draft: dict | None = None     # done 时的 PdfImportDraft dict
    error: str | None = None      # failed 时的错误信息
    created_at: float = field(default_factory=time.monotonic)
    finished_at: float | None = None


# 进程内任务表 + 锁（单 worker 部署，安全）
_jobs: dict[str, _Job] = {}
_lock = threading.Lock()

# OCR 线程池（懒创建，避免 import 即起线程）
_executor: ThreadPoolExecutor | None = None
_executor_lock = threading.Lock()

# OCR 引擎懒加载单例（首次用时加载 onnxruntime 模型，耗时较大，故延迟）
_ocr_engine = None
_ocr_lock = threading.Lock()


def _get_executor() -> ThreadPoolExecutor:
    """获取/创建 OCR 线程池（并发上限由 pdf_max_workers 控制）"""
    global _executor
    if _executor is None:
        with _executor_lock:
            if _executor is None:
                _executor = ThreadPoolExecutor(
                    max_workers=settings.pdf_max_workers, thread_name_prefix="pdf-import"
                )
    return _executor


def _get_ocr_engine():
    """rapidocr 引擎懒加载（首次用时加载，后续复用）。测试可 monkeypatch 替换"""
    global _ocr_engine
    if _ocr_engine is None:
        with _ocr_lock:
            if _ocr_engine is None:
                from rapidocr_onnxruntime import RapidOCR
                _ocr_engine = RapidOCR()
    return _ocr_engine


def _title_from(doc: "pymupdf.Document", filename: str) -> str:
    """标题来源：PDF metadata title → 文件名去扩展名 → 兜底"""
    try:
        meta_title = ((doc.metadata or {}).get("title") or "").strip()
    except Exception:
        meta_title = ""
    if meta_title:
        return meta_title
    base = os.path.basename(filename or "")
    stem, _ = os.path.splitext(base)
    if stem.strip():
        return stem.strip()
    return "导入的 PDF"


def _ocr_page(page: "pymupdf.Page") -> str:
    """渲染单页为图片并 OCR，返回识别出的文本（扫描页/图片页用）"""
    pix = page.get_pixmap(dpi=200)
    img_bytes = pix.tobytes("png")
    engine = _get_ocr_engine()
    result, _elapse = engine(img_bytes)
    if not result:
        return ""
    # result: [[box, text, score], ...]
    texts = [item[1] for item in result if item and len(item) > 1]
    return "\n".join(t for t in texts if t)


def _run_job(job_id: str, user_id: int, file_bytes: bytes, filename: str) -> None:
    """线程池内执行：逐页抽文本（空则 OCR）→ 拼 MD → 更新 job 状态。
    任一异常 → 标 failed；超 deadline → 标 failed。"""
    deadline = time.monotonic() + settings.pdf_timeout_seconds
    try:
        with _lock:
            job = _jobs.get(job_id)
            if job is None:
                return
            job.status = "running"
        doc = pymupdf.open(stream=file_bytes, filetype="pdf")
        try:
            total = doc.page_count
            with _lock:
                job.total = total
            sections: list[str] = []
            for i in range(total):
                if time.monotonic() > deadline:
                    raise TimeoutError("PDF 导入超时")
                page = doc[i]
                text = (page.get_text("text") or "").strip()
                if not text:
                    # 扫描页/图片型：渲染成图后 OCR
                    try:
                        text = _ocr_page(page).strip()
                    except Exception:
                        text = ""
                if text:
                    sections.append(f"## 第 {i + 1} 页\n\n{text}")
                else:
                    sections.append(f"## 第 {i + 1} 页\n\n<!-- 图片占位：第 {i + 1} 页无可识别文字 -->")
                with _lock:
                    job.progress = i + 1
            title = _title_from(doc, filename)
            content = f"> 来源：导入的 PDF《{title}》\n\n" + "\n\n".join(sections)
            draft = {"title": title, "content": content, "suggested_tags": []}
            with _lock:
                job.status = "done"
                job.draft = draft
                job.finished_at = time.monotonic()
        finally:
            doc.close()
    except Exception as e:
        msg = str(e) or "转换失败"
        with _lock:
            j = _jobs.get(job_id)
            if j is not None:
                j.status = "failed"
                j.error = msg
                j.finished_at = time.monotonic()


def _cleanup() -> None:
    """清理过期任务（已完成且超过 pdf_job_ttl_seconds）。get_job 时顺带调用"""
    now = time.monotonic()
    ttl = settings.pdf_job_ttl_seconds
    with _lock:
        expired = [jid for jid, j in _jobs.items()
                   if j.finished_at is not None and now - j.finished_at > ttl]
        for jid in expired:
            _jobs.pop(jid, None)


def create_job(user_id: int, filename: str, file_bytes: bytes) -> str:
    """校验大小/页数 + 建任务 + 提交线程池，返回 job_id。
    失败抛 PdfImportError（too_large/too_many_pages/busy/invalid）。"""
    # 1) 体积上限
    if len(file_bytes) > settings.pdf_max_bytes:
        raise PdfImportError(
            f"文件过大（{len(file_bytes)} > {settings.pdf_max_bytes} 字节）", kind="too_large")
    # 2) 解析 + 页数上限（同步做，给用户即时 4xx，不进线程池才发现问题）
    try:
        doc = pymupdf.open(stream=file_bytes, filetype="pdf")
    except Exception as e:
        raise PdfImportError("无法解析 PDF 文件，请确认是有效的 PDF") from e
    try:
        page_count = doc.page_count
    finally:
        doc.close()
    if page_count <= 0:
        raise PdfImportError("PDF 没有任何页面", kind="invalid")
    if page_count > settings.pdf_max_pages:
        raise PdfImportError(
            f"页数超限（{page_count} > {settings.pdf_max_pages}），请拆分后重试",
            kind="too_many_pages")
    # 3) 每用户同时只 1 个进行中任务（避免 OCR 堆积）
    with _lock:
        running = [j for j in _jobs.values()
                   if j.user_id == user_id and j.status in ("pending", "running")]
        if running:
            raise PdfImportError("已有导入任务进行中，请等待完成", kind="busy")
        job_id = uuid.uuid4().hex
        _jobs[job_id] = _Job(job_id=job_id, user_id=user_id, total=page_count)
    # 4) 提交线程池
    _get_executor().submit(_run_job, job_id, user_id, file_bytes, filename)
    return job_id


def get_job(job_id: str, user_id: int) -> dict | None:
    """返回任务状态快照。不存在或非本人 → None（隔离：别人的 job 当作不存在）。
    顺带清理过期任务。"""
    _cleanup()
    with _lock:
        job = _jobs.get(job_id)
        if job is None or job.user_id != user_id:
            return None
        return {
            "job_id": job.job_id,
            "status": job.status,
            "progress": job.progress,
            "total": job.total,
            "draft": job.draft,
            "error": job.error,
        }
