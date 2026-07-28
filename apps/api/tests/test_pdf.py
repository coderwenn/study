# PDF 导入：服务层（任务表/转换/OCR/校验）+ 路由层（鉴权/状态码）测试
import concurrent.futures

import pymupdf
import pytest

from app.services import pdf_import_service as svc
from tests.helpers import register_and_login


# —— 辅助：生成测试用 PDF bytes ——


def _make_text_pdf(pages: list[str]) -> bytes:
    """生成多页文本型 PDF（每页插入一段英文文本，便于 get_text 抽回）"""
    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page()
        page.insert_text((72, 72), text)
    return doc.tobytes()


def _make_image_pdf(num_pages: int = 1) -> bytes:
    """生成无文字页 PDF（只有空白页，get_text 返回空 → 触发 OCR 路径）"""
    doc = pymupdf.open()
    for _ in range(num_pages):
        doc.new_page()
    return doc.tobytes()


class _SyncExecutor:
    """同步执行器：submit 立即跑完，便于测试不依赖线程时序"""
    def submit(self, fn, *args, **kwargs):
        fn(*args, **kwargs)
        fut = concurrent.futures.Future()
        fut.set_result(None)
        return fut


@pytest.fixture(autouse=True)
def _isolate_jobs(monkeypatch):
    """每个用例前清空任务表 + 注入同步执行器（任务提交后立即完成）"""
    svc._jobs.clear()
    monkeypatch.setattr(svc, "_get_executor", lambda: _SyncExecutor())
    yield
    svc._jobs.clear()


# —— 服务层：create_job 校验 ——


def test_create_job_too_large(monkeypatch):
    """体积超限 → too_large"""
    monkeypatch.setattr(svc.settings, "pdf_max_bytes", 16)
    with pytest.raises(svc.PdfImportError) as exc:
        svc.create_job(1, "x.pdf", b"x" * 1024)
    assert exc.value.kind == "too_large"


def test_create_job_invalid_pdf():
    """非 PDF 内容 → invalid"""
    with pytest.raises(svc.PdfImportError) as exc:
        svc.create_job(1, "x.pdf", b"not a pdf at all")
    assert exc.value.kind == "invalid"


def test_create_job_zero_pages():
    """无法构造 0 页 PDF，这里用损坏 bytes 走 invalid 分支兜底"""
    with pytest.raises(svc.PdfImportError):
        svc.create_job(1, "x.pdf", b"")


def test_create_job_too_many_pages(monkeypatch):
    """页数超限 → too_many_pages"""
    monkeypatch.setattr(svc.settings, "pdf_max_pages", 2)
    data = _make_text_pdf(["a", "b", "c"])
    with pytest.raises(svc.PdfImportError) as exc:
        svc.create_job(1, "x.pdf", data)
    assert exc.value.kind == "too_many_pages"


def test_create_job_busy_blocks_second_running():
    """已有进行中任务 → busy"""
    data = _make_text_pdf(["hello"])
    svc.create_job(1, "first.pdf", data)
    # 第一个任务因同步执行器已 done；人为塞一个 running 占位
    with svc._lock:
        svc._jobs["fake-running"] = svc._Job(job_id="fake-running", user_id=1, status="running")
    with pytest.raises(svc.PdfImportError) as exc:
        svc.create_job(1, "second.pdf", data)
    assert exc.value.kind == "busy"


def test_create_job_busy_isolated_per_user():
    """busy 仅限同用户：他人进行中不拦我"""
    with svc._lock:
        svc._jobs["other"] = svc._Job(job_id="other", user_id=999, status="running")
    data = _make_text_pdf(["mine"])
    job_id = svc.create_job(1, "mine.pdf", data)
    assert job_id


# —— 服务层：_run_job 转换 ——


def test_run_job_text_pdf_produces_markdown():
    """文本型 PDF → done + MD 含来源标注/页标题/正文"""
    data = _make_text_pdf(["Hello World page one", "Second page content"])
    job_id = svc.create_job(1, "report.pdf", data)
    job = svc.get_job(job_id, 1)
    assert job["status"] == "done"
    assert job["total"] == 2
    assert job["progress"] == 2
    draft = job["draft"]
    assert draft["title"] == "report"
    assert "> 来源：导入的 PDF《report》" in draft["content"]
    assert "## 第 1 页" in draft["content"]
    assert "Hello World page one" in draft["content"]
    assert "## 第 2 页" in draft["content"]
    assert draft["suggested_tags"] == []


def test_run_job_title_from_metadata_when_present():
    """metadata 有 title → 优先用 metadata title"""
    doc = pymupdf.open()
    doc.set_metadata({"title": "Real Title"})
    doc.new_page().insert_text((72, 72), "body text here")
    data = doc.tobytes()
    job_id = svc.create_job(1, "ignored.pdf", data)
    job = svc.get_job(job_id, 1)
    assert job["draft"]["title"] == "Real Title"


def test_run_job_image_pdf_uses_ocr(monkeypatch):
    """无文字页 → 走 OCR 路径；mock _ocr_page 返回固定文本"""
    monkeypatch.setattr(svc, "_ocr_page", lambda page: "OCR RECOGNIZED TEXT")
    data = _make_image_pdf(1)
    job_id = svc.create_job(1, "scan.pdf", data)
    job = svc.get_job(job_id, 1)
    assert job["status"] == "done"
    assert "OCR RECOGNIZED TEXT" in job["draft"]["content"]


def test_run_job_ocr_failure_leaves_placeholder(monkeypatch):
    """OCR 抛异常 → 该页留占位符，任务仍 done"""
    def boom(page):
        raise RuntimeError("ocr engine down")
    monkeypatch.setattr(svc, "_ocr_page", boom)
    data = _make_image_pdf(1)
    job_id = svc.create_job(1, "scan.pdf", data)
    job = svc.get_job(job_id, 1)
    assert job["status"] == "done"
    assert "图片占位" in job["draft"]["content"]


def test_run_job_timeout_marks_failed(monkeypatch):
    """超 deadline → failed + 错误信息"""
    monkeypatch.setattr(svc.settings, "pdf_timeout_seconds", 0)
    data = _make_text_pdf(["a"])
    job_id = svc.create_job(1, "x.pdf", data)
    job = svc.get_job(job_id, 1)
    assert job["status"] == "failed"
    assert "超时" in job["error"]


# —— 服务层：get_job 隔离与清理 ——


def test_get_job_isolation():
    """非本人 job → None（当作不存在）"""
    data = _make_text_pdf(["x"])
    job_id = svc.create_job(1, "a.pdf", data)
    assert svc.get_job(job_id, 999) is None
    # 本人可查
    assert svc.get_job(job_id, 1) is not None


def test_get_job_unknown_returns_none():
    assert svc.get_job("nope", 1) is None


def test_cleanup_expires_finished(monkeypatch):
    """已完成且超 TTL 的任务被清理"""
    data = _make_text_pdf(["x"])
    job_id = svc.create_job(1, "a.pdf", data)
    # 把 finished_at 退到很久以前
    with svc._lock:
        svc._jobs[job_id].finished_at = -1e9
    monkeypatch.setattr(svc.settings, "pdf_job_ttl_seconds", 1)
    svc._cleanup()
    assert svc.get_job(job_id, 1) is None


# —— 路由层 ——


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def test_import_401_without_token(client):
    """未登录 → 401"""
    r = client.post("/api/pdf/import", files={"file": ("x.pdf", b"%PDF", "application/pdf")})
    assert r.status_code == 401


def test_import_ok_returns_job_id(client, monkeypatch):
    """成功 → 200 + job_id（mock 服务）"""
    monkeypatch.setattr(svc, "create_job", lambda uid, fn, data: "job-123")
    token = register_and_login(client)
    data = _make_text_pdf(["hi"])
    r = client.post(
        "/api/pdf/import",
        files={"file": ("r.pdf", data, "application/pdf")},
        headers=_h(token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["job_id"] == "job-123"


def test_import_413_too_large(client, monkeypatch):
    monkeypatch.setattr(svc, "create_job",
                        lambda *a, **k: (_ for _ in ()).throw(svc.PdfImportError("big", "too_large")))
    token = register_and_login(client)
    r = client.post("/api/pdf/import", files={"file": ("x.pdf", b"x", "application/pdf")}, headers=_h(token))
    assert r.status_code == 413


def test_import_422_too_many_pages(client, monkeypatch):
    monkeypatch.setattr(svc, "create_job",
                        lambda *a, **k: (_ for _ in ()).throw(svc.PdfImportError("many", "too_many_pages")))
    token = register_and_login(client)
    r = client.post("/api/pdf/import", files={"file": ("x.pdf", b"x", "application/pdf")}, headers=_h(token))
    assert r.status_code == 422


def test_import_429_busy(client, monkeypatch):
    monkeypatch.setattr(svc, "create_job",
                        lambda *a, **k: (_ for _ in ()).throw(svc.PdfImportError("busy", "busy")))
    token = register_and_login(client)
    r = client.post("/api/pdf/import", files={"file": ("x.pdf", b"x", "application/pdf")}, headers=_h(token))
    assert r.status_code == 429


def test_import_400_empty_file(client):
    """空文件 → 400"""
    token = register_and_login(client)
    r = client.post("/api/pdf/import", files={"file": ("x.pdf", b"", "application/pdf")}, headers=_h(token))
    assert r.status_code == 400


def test_get_job_401_without_token(client):
    r = client.get("/api/pdf/jobs/whatever")
    assert r.status_code == 401


def test_get_job_404_unknown(client, monkeypatch):
    """不存在/非本人 → 404"""
    monkeypatch.setattr(svc, "get_job", lambda jid, uid: None)
    token = register_and_login(client)
    r = client.get("/api/pdf/jobs/nope", headers=_h(token))
    assert r.status_code == 404


def test_get_job_200_returns_status(client, monkeypatch):
    monkeypatch.setattr(svc, "get_job", lambda jid, uid: {
        "job_id": jid, "status": "running", "progress": 3, "total": 10,
        "draft": None, "error": None,
    })
    token = register_and_login(client)
    r = client.get("/api/pdf/jobs/j-1", headers=_h(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "running"
    assert body["progress"] == 3
    assert body["total"] == 10


def test_get_job_200_done_with_draft(client, monkeypatch):
    monkeypatch.setattr(svc, "get_job", lambda jid, uid: {
        "job_id": jid, "status": "done", "progress": 2, "total": 2,
        "draft": {"title": "T", "content": "## 第 1 页\n\nhi", "suggested_tags": []},
        "error": None,
    })
    token = register_and_login(client)
    r = client.get("/api/pdf/jobs/j-1", headers=_h(token))
    assert r.status_code == 200
    assert r.json()["draft"]["title"] == "T"


def test_get_job_failed_returns_error(client, monkeypatch):
    monkeypatch.setattr(svc, "get_job", lambda jid, uid: {
        "job_id": jid, "status": "failed", "progress": 0, "total": 1,
        "draft": None, "error": "boom",
    })
    token = register_and_login(client)
    r = client.get("/api/pdf/jobs/j-1", headers=_h(token))
    assert r.status_code == 200
    assert r.json()["error"] == "boom"
