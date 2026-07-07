# 网页总结（从链接总结）— 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在笔记应用里加一个「从链接总结」入口（Sidebar 按钮 → 弹窗）。用户粘贴一条链接，后端 agent 抓取并理解该网页、产出一份草稿（源链接 + 页面标题 + 中文总结 + 建议标签）返回前端；用户在弹窗里预览/编辑后决定是否「保存为笔记」（content = 源链接 + 总结，保存复用现有创建笔记流程）。草稿不落库、不写文件，无状态。

**Architecture:** 后端 FastAPI 新增 `POST /api/summarize`：复用现有鉴权，加「未配置→503 / per-user 限流→429 / URL 非法→400 / agent 触顶→504 / LLM 故障→502」守卫。新增 `services/summarize_service.py` 实现「真·agentic 工具调用循环」（httpx 直连 OpenAI 兼容端点，无框架；工具集 `fetch_page` + `extract_main_text` + `submit_draft`（终答）；硬上限迭代/超时）+ `validate_url`（SSRF 防护，见 ADR-002）+ `extract_main_text`（trafilatura）+ `chat_with_tools`（LLM 客户端）。新增 `services/rate_limiter.py`（内存级 per-user 滑动窗口）。前端新增 `api/summarize.ts` + `SummarizeDialog` 组件 + Sidebar 按钮。详见 ADR-001（agent over 管线）、ADR-002（SSRF 防护）与 `CONTEXT.md`。

**Tech Stack:** 后端 FastAPI · pydantic-settings · **新增依赖 `httpx`（转正式）+ `trafilatura`**；前端 React 18 · TypeScript · TanStack Query · axios · `lucide-react`；测试 pytest+httpx(MockTransport) / vitest。

**约定：**
- 后端测试：`cd apps/api && uv run pytest tests/test_summarize.py -v`（全量 `cd apps/api && uv run pytest`）。HTTP/LLM 一律用 `httpx.MockTransport` 注入，DNS 用 `monkeypatch.setattr(socket, "getaddrinfo", ...)`，配置用 `monkeypatch.setattr(settings, ...)`，与现有 `tests/test_wiki.py` 同范式。
- 前端测试：`pnpm --filter web test -- --run src/test/summarize.test.ts`（全量 `pnpm --filter web test -- --run`）；构建 `pnpm --filter web build`。
- 提交信息沿用仓库 conventional commits 风格（中文描述）。
- 纯函数（`validate_url` / `extract_main_text` / `RateLimiter`）与 agent 循环 / 路由走完整 TDD；`SummarizeDialog` / `Sidebar` 接入承编辑器先例**手动验证**。
- 端点能力前提：接入时用一次真实调用坐实 `LLM_*` 端点+模型支持 function-calling 并返回 `tool_calls`（ADR-001 硬前提）。

---

## 文件结构

| 文件 | 职责 | 动作 |
| --- | --- | --- |
| `apps/api/pyproject.toml` | 加 `httpx`（正式）+ `trafilatura` | 修改 |
| `apps/api/app/config.py` | LLM + 总结循环 + 限流 配置字段 | 修改 |
| `apps/api/app/schemas/summarize.py` | `SummarizeRequest` / `SummarizeDraft` | 新建 |
| `apps/api/app/services/rate_limiter.py` | 内存级 per-user 滑动窗口限流 | 新建 |
| `apps/api/app/services/summarize_service.py` | `validate_url` / `extract_main_text` / `fetch_page` / `chat_with_tools` / `summarize_url` + 异常类 | 新建 |
| `apps/api/app/routers/summarize.py` | `POST /api/summarize`：503/429/400/504/502/200 | 新建 |
| `apps/api/app/main.py` | 注册 summarize 路由 | 修改 |
| `apps/api/tests/test_summarize.py` | 服务 + 路由测试 | 新建 |
| `apps/web/src/api/summarize.ts` | `summarizeLink(url)` axios 封装 | 新建 |
| `apps/web/src/test/summarize.test.ts` | api 封装契约测试 | 新建 |
| `apps/web/src/components/SummarizeDialog.tsx` | 弹窗：URL 输入→加载→可编辑预览→保存 | 新建 |
| `apps/web/src/components/Sidebar.tsx` | 「从链接总结」按钮 | 修改 |
| `apps/web/src/pages/NotesPage.tsx` | 弹窗状态 + 接线 | 修改 |
| `docker-compose.yml` | `LLM_*` + 总结上限 env | 修改 |
| `.env.example` / `apps/api/.env.example` | LLM env 示例 | 修改 |
| `CLAUDE.md` | 修正悬空的 HERMES_API_KEY → LLM_* | 修改 |
| `docs/deploy.md` | 网页总结部署说明 | 修改 |

---

## Task 1：依赖（httpx 转正式 + trafilatura）

**Files:**
- Modify: `apps/api/pyproject.toml`

> 无单测（依赖）。`httpx` 现为 dev 依赖，转正式；新增 `trafilatura` 做正文抽取。

- [ ] **Step 1: 改 pyproject.toml**

把 `httpx>=0.27` 从 `[dependency-groups] dev` **移到** `[project] dependencies`（删 dev 里的 httpx 行）；在 `dependencies` 里追加 `trafilatura>=1.12`：

```toml
dependencies = [
    "fastapi>=0.110",
    "uvicorn[standard]>=0.27",
    "sqlalchemy>=2.0",
    "pydantic>=2.6",
    "pydantic-settings>=2.1",
    "pyjwt>=2.8",
    "passlib[bcrypt]>=1.7.4",
    "bcrypt<4.1",
    "python-multipart>=0.0.9",
    "httpx>=0.27",
    "trafilatura>=1.12",
]

[dependency-groups]
dev = [
    "pytest>=8.0",
]
```

- [ ] **Step 2: 同步依赖**

Run: `cd apps/api && uv sync`
Expected: 安装 `httpx`、`trafilatura`（及其依赖）成功。

- [ ] **Step 3: 冒烟验证导入**

Run: `cd apps/api && uv run python -c "import httpx, trafilatura; print(httpx.__version__, trafilatura.__version__)"`
Expected: 打印两个版本号，无报错。

- [ ] **Step 4: 提交**

```bash
git add apps/api/pyproject.toml apps/api/uv.lock
git commit -m "chore(api): 加 httpx(转正式)+trafilatura 依赖"
```

---

## Task 2：config 字段 + .env.example + 修 CLAUDE.md

**Files:**
- Modify: `apps/api/app/config.py`
- Modify: `.env.example`
- Modify: `apps/api/.env.example`
- Modify: `CLAUDE.md`

> 纯配置，无单测（沿用现有 config 不测的惯例）。顺便修掉 CLAUDE.md 里悬空的 HERMES_API_KEY。

- [ ] **Step 1: config.py 加字段**

在 `Settings` 类内（`wiki_*` 字段之后、`model_config` 之前）追加：

```python
    # —— 网页总结：agent 抓取 + LLM 总结（OpenAI 兼容端点；见 ADR-001/002）——
    # LLM 端点（OpenAI 兼容根，形如 http://host/v1）；三件全填才开启，否则端点 503
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""
    # agent 循环硬上限
    summarize_max_iters: int = 5            # 单次请求最大 LLM 往返数
    summarize_timeout_seconds: int = 60     # 单次请求墙钟上限
    summarize_max_bytes: int = 5_000_000    # fetch_page 体积上限（防内存炸弹）
    # per-user 内存限流（滑动窗口）
    summarize_rate_limit: int = 10          # 窗口内最大请求数
    summarize_rate_window_seconds: int = 60
```

- [ ] **Step 2: 根 .env.example 补占位**

在末尾追加：

```bash

# 网页总结（可选；LLM_* 三件全填才开启，否则功能关闭、端点返回 503）
# LLM_BASE_URL：OpenAI 兼容端点根（以 /v1 结尾，如 http://open-webui:3000/v1）
# LLM_MODEL：function-calling 能力可用的模型名
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=
```

- [ ] **Step 3: apps/api/.env.example 补字段（本地开发）**

在末尾追加：

```bash

# 网页总结（本地开发用；留空则功能关闭）
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=
```

- [ ] **Step 4: 修 CLAUDE.md 悬空引用**

把 `## 部署` 小节里这句：

> `.env` 必须设置 `SECRET_KEY`（`openssl rand -hex 32`）和 `HERMES_API_KEY`（Open WebUI 连 AI 后端）。

改为：

> `.env` 必须设置 `SECRET_KEY`（`openssl rand -hex 32`）。开启「网页总结」需再设 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`（OpenAI 兼容端点，模型需支持 function-calling；不填则该功能关闭、端点返回 503）。

- [ ] **Step 5: 提交**

```bash
git add apps/api/app/config.py .env.example apps/api/.env.example CLAUDE.md
git commit -m "feat(api): 网页总结 config(LLM_*/上限/限流)+修 CLAUDE.md"
```

---

## Task 3：validate_url — SSRF 守卫（纯函数）

**Files:**
- Create: `apps/api/app/services/summarize_service.py`
- Test: `apps/api/tests/test_summarize.py`

> ADR-002 的核心：scheme 白名单 + DNS 解析后屏蔽内网/环回/链路本地 IP。纯函数，DNS 用 monkeypatch，无真实网络。

- [ ] **Step 1: 写失败测试**

创建 `apps/api/tests/test_summarize.py`：

```python
# 网页总结：SSRF 守卫 / 抽取 / fetch / agent 循环 / 路由 测试
import socket

import pytest

from app.services import summarize_service as ss


def _fake_dns(ip: str):
    """造一个 getaddrinfo 替身，固定返回某 IP（type=SOCK_STREAM 形态）"""
    def fake(host, port, *a, **kw):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port))]
    return fake


def test_validate_rejects_non_http_scheme():
    """非 http/https scheme → ValueError"""
    with pytest.raises(ValueError):
        ss.validate_url("file:///etc/passwd")
    with pytest.raises(ValueError):
        ss.validate_url("data:text/html,<x>")
    with pytest.raises(ValueError):
        ss.validate_url("gopher://x")


def test_validate_rejects_empty_and_no_host():
    """空 / 无主机名 → ValueError"""
    with pytest.raises(ValueError):
        ss.validate_url("")
    with pytest.raises(ValueError):
        ss.validate_url("http:///path")


def test_validate_blocks_loopback(monkeypatch):
    """环回 IP → 拒绝（即使 scheme 合法）"""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_dns("127.0.0.1"))
    with pytest.raises(ValueError):
        ss.validate_url("http://localhost/x")


def test_validate_blocks_private(monkeypatch):
    """内网段 → 拒绝"""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_dns("10.0.0.5"))
    with pytest.raises(ValueError):
        ss.validate_url("http://internal.corp/x")
    monkeypatch.setattr(socket, "getaddrinfo", _fake_dns("192.168.1.1"))
    with pytest.raises(ValueError):
        ss.validate_url("http://router/x")


def test_validate_blocks_link_local_metadata(monkeypatch):
    """链路本地（含云元数据 169.254.169.254）→ 拒绝"""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_dns("169.254.169.254"))
    with pytest.raises(ValueError):
        ss.validate_url("http://169.254.169.254/latest/meta-data/")


def test_validate_allows_public(monkeypatch):
    """公网 IP → 放行，返回原 url"""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_dns("93.184.216.34"))
    assert ss.validate_url("https://example.com/a") == "https://example.com/a"


def test_validate_blocks_any_private_among_resolved(monkeypatch):
    """多解析结果里只要有一个内网 IP → 拒绝（防 happy-path 混入）"""
    def fake(host, port, *a, **kw):
        return [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.1.2.3", port)),
        ]
    monkeypatch.setattr(socket, "getaddrinfo", fake)
    with pytest.raises(ValueError):
        ss.validate_url("https://example.com/")
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd apps/api && uv run pytest tests/test_summarize.py -v`
Expected: FAIL（`ModuleNotFoundError: app.services.summarize_service`）。

- [ ] **Step 3: 实现 validate_url + 异常类**

创建 `apps/api/app/services/summarize_service.py`：

```python
# 网页总结：SSRF 守卫 + 抽取 + fetch + LLM 工具调用循环（agent）
# 详见 ADR-001（agent over 管线）、ADR-002（SSRF 防护）、CONTEXT.md
import ipaddress
import socket
from urllib.parse import urlparse

from app.config import settings

# 只放行 http/https，挡掉 file/gopher/data/ftp 等
_ALLOWED_SCHEMES = {"http", "https"}


class SummarizeError(Exception):
    """agent 循环层错误（终止映射到 504/422）。kind: timeout/max_iters/no_draft"""
    def __init__(self, message: str, kind: str = "no_draft"):
        super().__init__(message)
        self.kind = kind


class FetchError(Exception):
    """抓取层错误（被工具吞掉回喂给 agent，一般不外抛）。kind: http/redirect/content_type/too_large"""
    def __init__(self, message: str, kind: str = "http"):
        super().__init__(message)
        self.kind = kind


class LLMError(Exception):
    """LLM 客户端层错误。kind: unconfigured/unreachable/http"""
    def __init__(self, message: str, kind: str = "http"):
        super().__init__(message)
        self.kind = kind


def _is_blocked_ip(ip: str) -> bool:
    """IP 是否落在禁止段（内网/环回/链路本地/保留/组播/未指定）；解析不出也算拦"""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    )


def validate_url(url: str) -> str:
    """SSRF 守卫：scheme 白名单 + DNS 解析后屏蔽内网/环回/链路本地 IP。
    通过返回原 url；违规抛 ValueError（路由层转 400）。"""
    if not url or not isinstance(url, str):
        raise ValueError("URL 为空")
    parsed = urlparse(url)
    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise ValueError(f"仅允许 http/https 链接（得到 {parsed.scheme or '无 scheme'}）")
    if not parsed.hostname:
        raise ValueError("链接缺少主机名")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        infos = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise ValueError(f"无法解析主机：{parsed.hostname}") from e
    # 任一解析结果落在禁止段即拒绝（防 happy-path 混入）
    for info in infos:
        ip = info[4][0]
        if _is_blocked_ip(ip):
            raise ValueError(f"目标地址 {ip} 属内网/保留段，已拒绝")
    return url
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd apps/api && uv run pytest tests/test_summarize.py -v`
Expected: PASS（7 条）。

- [ ] **Step 5: 提交**

```bash
git add apps/api/app/services/summarize_service.py apps/api/tests/test_summarize.py
git commit -m "feat(api): validate_url SSRF 守卫(scheme+DNS+IP 段)"
```

---

## Task 4：extract_main_text — trafilatura 抽正文（纯函数）

**Files:**
- Modify: `apps/api/app/services/summarize_service.py`
- Test: `apps/api/tests/test_summarize.py`

- [ ] **Step 1: 写失败测试**

在 `tests/test_summarize.py` 顶部追加导入：

```python
from app.services.summarize_service import extract_main_text
```

追加测试：

```python
_HTML = """
<html><head><title>如何学习系统设计 — 实战指南</title></head>
<body>
  <nav>首页 博客 关于</nav>
  <article>
    <h1>如何学习系统设计</h1>
    <p>系统设计是一门权衡的艺术。本文讲三条核心原则：边界、容量、退化。</p>
    <p>先画清边界，再算容量，最后设计退化路径。</p>
  </article>
  <footer>版权所有 联系我们</footer>
</body></html>
"""


def test_extract_returns_title_and_body():
    """抽取：标题来自 <title>/metadata，正文含核心句、不含导航/页脚"""
    title, text = extract_main_text(_HTML)
    assert "系统设计" in title
    assert "权衡的艺术" in text
    # 导航/页脚的噪声不应进正文
    assert "联系我们" not in text


def test_extract_empty_html():
    """空 HTML → ("", "")"""
    assert extract_main_text("") == ("", "")
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd apps/api && uv run pytest tests/test_summarize.py -v`
Expected: FAIL（`extract_main_text` 未定义）。

- [ ] **Step 3: 实现 extract_main_text**

在 `summarize_service.py` 顶部 import 区追加：

```python
import re

import trafilatura
```

在 `validate_url` 之后追加：

```python
_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)


def _title_from_html(html: str) -> str:
    """<title> 正则兜底抽标题（trafilatura metadata 不可用时的回退）"""
    m = _TITLE_RE.search(html)
    return m.group(1).strip() if m else ""


def extract_main_text(html: str) -> tuple[str, str]:
    """从 HTML 抽取正文。返回 (title, text)。trafilatura 抽不出正文时 text 为空串。"""
    if not html:
        return "", ""
    # 正文：favor_precision 偏向精准、去噪（导航/页脚/评论）
    text = trafilatura.extract(
        html, include_comments=False, include_tables=False, favor_precision=True
    ) or ""
    # 标题：优先 trafilatura metadata，不可用则 <title> 正则
    title = _title_from_html(html)
    try:
        meta = trafilatura.extract_metadata(html)
        if meta and getattr(meta, "title", None):
            title = (meta.title or "").strip() or title
    except Exception:
        pass  # metadata 解析失败不影响正文
    return title, text
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd apps/api && uv run pytest tests/test_summarize.py -v`
Expected: PASS（9 条）。

- [ ] **Step 5: 提交**

```bash
git add apps/api/app/services/summarize_service.py apps/api/tests/test_summarize.py
git commit -m "feat(api): extract_main_text(trafilatura 抽标题+正文)"
```

---

## Task 5：fetch_page — SSRF + 逐跳重定向校验 + 体积/类型闸门

**Files:**
- Modify: `apps/api/app/services/summarize_service.py`
- Test: `apps/api/tests/test_summarize.py`

> 用 `httpx.MockTransport` 注入假响应，DNS 用 monkeypatch。重定向逐跳重校验、体积上限、Content-Type 闸门各覆盖一例。

- [ ] **Step 1: 写失败测试**

在 `tests/test_summarize.py` 顶部追加导入：

```python
import httpx

from app.services.summarize_service import fetch_page
```

追加测试（公网 DNS 桩统一返回一个公网 IP，避免真实解析）：

```python
def _pub_dns(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_dns("93.184.216.34"))


def test_fetch_ok_html(monkeypatch):
    """200 + text/html → 返回 {url, html}"""
    _pub_dns(monkeypatch)
    transport = httpx.MockTransport(lambda req: httpx.Response(
        200, headers={"content-type": "text/html; charset=utf-8"}, content=b"<html><body>hi</body></html>"
    ))
    r = fetch_page("https://example.com/", transport=transport)
    assert "hi" in r["html"]


def test_fetch_rejects_private_url(monkeypatch):
    """URL 解析到内网 → FetchError（即便 transport 是假的，validate_url 先挡）"""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_dns("10.0.0.1"))
    transport = httpx.MockTransport(lambda req: httpx.Response(200, content=b"x"))
    with pytest.raises(ss.FetchError):
        fetch_page("https://internal/x", transport=transport)


def test_fetch_follows_redirect_revalidating(monkeypatch):
    """301 到新路径 → 逐跳重校验后跟随，拿到最终 HTML"""
    _pub_dns(monkeypatch)

    def handler(req):
        if req.url.path == "/start":
            return httpx.Response(301, headers={"location": "https://example.com/final"})
        return httpx.Response(200, headers={"content-type": "text/html"}, content=b"<p>final</p>")

    r = fetch_page("https://example.com/start", transport=httpx.MockTransport(handler))
    assert "final" in r["html"]


def test_fetch_redirect_to_private_blocked(monkeypatch):
    """重定向目标解析到内网 → FetchError（逐跳重校验生效）"""
    _pub_dns(monkeypatch)

    def handler(req):
        if req.url.path == "/start":
            return httpx.Response(302, headers={"location": "https://evil/x"})
        return httpx.Response(200, content=b"x")

    # 把 evil 的解析桩成内网；example.com 仍是公网
    real_fake = _fake_dns("93.184.216.34")

    def dns(host, port, *a, **kw):
        return _fake_dns("10.5.5.5")(host, port, *a, **kw) if host == "evil" else real_fake(host, port, *a, **kw)

    monkeypatch.setattr(socket, "getaddrinfo", dns)
    with pytest.raises(ss.FetchError):
        fetch_page("https://example.com/start", transport=httpx.MockTransport(handler))


def test_fetch_non_html_rejected(monkeypatch):
    """Content-Type 非 html → FetchError(content_type)"""
    _pub_dns(monkeypatch)
    transport = httpx.MockTransport(lambda req: httpx.Response(
        200, headers={"content-type": "application/pdf"}, content=b"%PDF"
    ))
    with pytest.raises(ss.FetchError):
        fetch_page("https://example.com/x", transport=transport)


def test_fetch_too_large_aborted(monkeypatch):
    """体积超限 → FetchError(too_large)"""
    _pub_dns(monkeypatch)
    monkeypatch.setattr(ss.settings, "summarize_max_bytes", 16)
    transport = httpx.MockTransport(lambda req: httpx.Response(
        200, headers={"content-type": "text/html"}, content=b"x" * 1024
    ))
    with pytest.raises(ss.FetchError):
        fetch_page("https://example.com/x", transport=transport)
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd apps/api && uv run pytest tests/test_summarize.py -v`
Expected: FAIL（`fetch_page` 未定义）。

- [ ] **Step 3: 实现 fetch_page**

在 `summarize_service.py` 顶部 import 区追加：

```python
import httpx
```

在 `extract_main_text` 之后追加：

```python
_MAX_REDIRECTS = 5


def fetch_page(url: str, transport: httpx.BaseTransport | None = None) -> dict:
    """抓取一个 URL（含 SSRF 校验、逐跳重定向重校验、体积/超时上限、Content-Type 闸门）。
    返回 {"url": final_url, "html": html}。失败抛 FetchError。
    transport：测试注入 httpx.MockTransport；生产留空用真实连接。"""
    # 入口校验（agent 内每次调用也都会过这里）
    try:
        validate_url(url)
    except ValueError as e:
        raise FetchError(str(e), kind="ssrf") from e
    timeout = httpx.Timeout(10.0, read=30.0)
    headers = {"User-Agent": "NotesPro-Summarizer/1.0 (+notes-app)"}
    current = url
    with httpx.Client(follow_redirects=False, timeout=timeout, headers=headers, transport=transport) as client:
        for _ in range(_MAX_REDIRECTS + 1):
            # 逐跳重校验（防 302 绕到内网）
            try:
                validate_url(current)
            except ValueError as e:
                raise FetchError(str(e), kind="ssrf") from e
            with client.stream("GET", current) as r:
                if r.status_code in (301, 302, 303, 307, 308):
                    loc = r.headers.get("location")
                    if not loc:
                        raise FetchError("重定向缺 Location", kind="redirect")
                    current = str(httpx.URL(current).join(loc))
                    continue
                if r.status_code != 200:
                    raise FetchError(f"目标返回 HTTP {r.status_code}", kind="http")
                ctype = r.headers.get("content-type", "").lower()
                if "html" not in ctype:
                    raise FetchError(f"非网页内容（{ctype or '未知'}）", kind="content_type")
                # 流式读取 + 体积上限，防内存炸弹
                body = bytearray()
                for chunk in r.iter_bytes(chunk_size=65536):
                    body.extend(chunk)
                    if len(body) > settings.summarize_max_bytes:
                        raise FetchError("页面体积超过上限", kind="too_large")
                html = bytes(body).decode("utf-8", errors="replace")
                return {"url": str(r.url), "html": html}
    raise FetchError("重定向次数过多", kind="redirect")
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd apps/api && uv run pytest tests/test_summarize.py -v`
Expected: PASS（15 条）。

- [ ] **Step 5: 提交**

```bash
git add apps/api/app/services/summarize_service.py apps/api/tests/test_summarize.py
git commit -m "feat(api): fetch_page(SSRF+逐跳重定向+体积/类型闸门)"
```

---

## Task 6：chat_with_tools — LLM 客户端（OpenAI 兼容）

**Files:**
- Modify: `apps/api/app/services/summarize_service.py`
- Test: `apps/api/tests/test_summarize.py`

> 薄封装：POST {base_url}/chat/completions 带 tools。未配置→LLMError(unconfigured)；网络/非 2xx→LLMError。MockTransport 测。

- [ ] **Step 1: 写失败测试**

在 `tests/test_summarize.py` 顶部追加导入：

```python
from app.services.summarize_service import chat_with_tools
```

追加测试：

```python
def _llm_settings(monkeypatch):
    monkeypatch.setattr(ss.settings, "llm_base_url", "http://llm/v1")
    monkeypatch.setattr(ss.settings, "llm_api_key", "key")
    monkeypatch.setattr(ss.settings, "llm_model", "m")


def test_chat_unconfigured_raises(monkeypatch):
    """未配置 → LLMError(unconfigured)"""
    monkeypatch.setattr(ss.settings, "llm_base_url", "")
    with pytest.raises(ss.LLMError):
        chat_with_tools([], [])


def test_chat_posts_to_completions_and_returns_json(monkeypatch):
    """POST 到 {base}/chat/completions，带 Authorization；回传解析后的 JSON"""
    _llm_settings(monkeypatch)
    seen = {}

    def handler(req):
        seen["url"] = str(req.url)
        seen["auth"] = req.headers.get("authorization")
        seen["body"] = req.read().decode()
        return httpx.Response(200, json={"choices": [{"message": {"content": "hi"}}]})

    resp = chat_with_tools([{"role": "user", "content": "x"}], [{"type": "function", "function": {"name": "f"}}],
                           transport=httpx.MockTransport(handler))
    assert seen["url"] == "http://llm/v1/chat/completions"
    assert seen["auth"] == "Bearer key"
    assert "tools" in seen["body"]
    assert resp["choices"][0]["message"]["content"] == "hi"


def test_chat_non_200_raises(monkeypatch):
    """端点非 200 → LLMError(http)"""
    _llm_settings(monkeypatch)
    transport = httpx.MockTransport(lambda req: httpx.Response(500, text="boom"))
    with pytest.raises(ss.LLMError):
        chat_with_tools([], [], transport=transport)
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd apps/api && uv run pytest tests/test_summarize.py -v`
Expected: FAIL（`chat_with_tools` 未定义）。

- [ ] **Step 3: 实现 chat_with_tools**

在 `summarize_service.py` 的 `fetch_page` 之后追加：

```python
def chat_with_tools(
    messages: list[dict],
    tools: list[dict],
    tool_choice: str | None = None,
    transport: httpx.BaseTransport | None = None,
) -> dict:
    """调一次 OpenAI 兼容 /v1/chat/completions（带 tools）。返回解析后的响应 JSON。
    未配置→LLMError(unconfigured)；不可达/非 2xx→LLMError。"""
    if not (settings.llm_base_url and settings.llm_api_key and settings.llm_model):
        raise LLMError("LLM 未配置", kind="unconfigured")
    url = settings.llm_base_url.rstrip("/") + "/chat/completions"
    payload: dict = {
        "model": settings.llm_model,
        "messages": messages,
        "tools": tools,
        "temperature": 0.3,
    }
    if tool_choice:
        payload["tool_choice"] = tool_choice
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=httpx.Timeout(15.0, read=60.0), transport=transport) as client:
            r = client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as e:
        raise LLMError(f"LLM 端点不可达：{e}", kind="unreachable") from e
    if r.status_code != 200:
        raise LLMError(f"LLM 返回 HTTP {r.status_code}", kind="http")
    return r.json()
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd apps/api && uv run pytest tests/test_summarize.py -v`
Expected: PASS（18 条）。

- [ ] **Step 5: 提交**

```bash
git add apps/api/app/services/summarize_service.py apps/api/tests/test_summarize.py
git commit -m "feat(api): chat_with_tools(OpenAI 兼容工具调用客户端)"
```

---

## Task 7：summarize_url — agent 工具调用循环

**Files:**
- Modify: `apps/api/app/services/summarize_service.py`
- Test: `apps/api/tests/test_summarize.py`

> ADR-001 核心：工具集 fetch_page/extract_main_text/submit_draft；submit_draft 即终止；硬上限迭代/超时。注入脚本化 MockTransport 测多轮 + 上限。

- [ ] **Step 1: 写失败测试**

在 `tests/test_summarize.py` 顶部追加导入：

```python
import json

from app.services.summarize_service import summarize_url
```

追加测试：

```python
def _tc(name, args, cid="c0"):
    """构造一个 tool_call 对象（OpenAI 形态）"""
    return {"id": cid, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}


def _resp(tool_calls=None, content=None):
    """构造 OpenAI 兼容的 choices 响应"""
    msg = {"role": "assistant", "content": content}
    if tool_calls:
        msg["tool_calls"] = tool_calls
    return {"choices": [{"message": msg}]}


def _html_transport():
    return httpx.MockTransport(lambda req: httpx.Response(
        200, headers={"content-type": "text/html"}, content="<html><head><title>T</title></head><body><p>正文ABC</p></body></html>".encode("utf-8")
    ))


def test_agent_loop_happy_path(monkeypatch):
    """三轮：fetch_page → extract_main_text → submit_draft → 返回草稿"""
    _llm_settings(monkeypatch)
    _pub_dns(monkeypatch)
    calls = {"n": 0}

    def llm_handler(req):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(200, json=_resp([_tc("fetch_page", {"url": "https://example.com/"}, "c1")]))
        if calls["n"] == 2:
            return httpx.Response(200, json=_resp([_tc("extract_main_text", {"html": "<x>正文ABC</x>"}, "c2")]))
        return httpx.Response(200, json=_resp([_tc(
            "submit_draft", {"title": "T", "summary": "总结-ABC", "suggested_tags": ["网页", "AI"]}, "c3")]))

    r = summarize_url(
        "https://example.com/",
        fetch_transport=_html_transport(),
        llm_transport=httpx.MockTransport(llm_handler),
    )
    assert r["url"] == "https://example.com/"
    assert r["title"] == "T"
    assert "ABC" in r["summary"]
    assert r["suggested_tags"] == ["网页", "AI"]


def test_agent_loop_caps_iters(monkeypatch):
    """模型一直只调 fetch_page 永不 submit → 触顶 max_iters → SummarizeError"""
    _llm_settings(monkeypatch)
    _pub_dns(monkeypatch)
    monkeypatch.setattr(ss.settings, "summarize_max_iters", 2)

    def llm_handler(req):
        return httpx.Response(200, json=_resp([_tc("fetch_page", {"url": "https://example.com/"}, "c1")]))

    with pytest.raises(ss.SummarizeError) as exc:
        summarize_url("https://example.com/", fetch_transport=_html_transport(),
                      llm_transport=httpx.MockTransport(llm_handler))
    assert exc.value.kind == "max_iters"


def test_agent_loop_prevalidates_user_url(monkeypatch):
    """入口 URL 解析到内网 → 直接 ValueError（不进 LLM）"""
    _llm_settings(monkeypatch)
    monkeypatch.setattr(socket, "getaddrinfo", _fake_dns("10.0.0.1"))
    with pytest.raises(ValueError):
        summarize_url("https://evil/")


def test_agent_loop_no_draft(monkeypatch):
    """模型回了纯文本、没工具调用 → SummarizeError(no_draft)"""
    _llm_settings(monkeypatch)
    _pub_dns(monkeypatch)
    monkeypatch.setattr(ss.settings, "summarize_max_iters", 1)

    def llm_handler(req):
        return httpx.Response(200, json=_resp(content="我不会"))

    with pytest.raises(ss.SummarizeError) as exc:
        summarize_url("https://example.com/", fetch_transport=_html_transport(),
                      llm_transport=httpx.MockTransport(llm_handler))
    assert exc.value.kind == "no_draft"
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd apps/api && uv run pytest tests/test_summarize.py -v`
Expected: FAIL（`summarize_url` 未定义）。

- [ ] **Step 3: 实现 summarize_url + 工具定义**

在 `summarize_service.py` 顶部 import 区追加：

```python
import json
import time
```

在 `chat_with_tools` 之后追加：

```python
# —— agent 工具定义（OpenAI function-calling schema）——
TOOLS = [
    {"type": "function", "function": {
        "name": "fetch_page",
        "description": "抓取一个网页的 HTML（服务端已做 SSRF 校验）。",
        "parameters": {"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]},
    }},
    {"type": "function", "function": {
        "name": "extract_main_text",
        "description": "从 HTML 抽取正文与标题，返回 {title, text}。",
        "parameters": {"type": "object", "properties": {"html": {"type": "string"}}, "required": ["html"]},
    }},
    {"type": "function", "function": {
        "name": "submit_draft",
        "description": "提交最终草稿并结束任务。调用此工具即代表完成。",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "summary": {"type": "string"},
                "suggested_tags": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["title", "summary"],
        },
    }},
]

_SYSTEM_PROMPT = (
    "你是网页总结助手。流程：用 fetch_page 抓用户给的链接 → 用 extract_main_text 抽正文 → "
    "用 submit_draft 提交中文总结草稿（title/summary/suggested_tags）。"
    "summary 用 Markdown、简洁有条理。若抓不到或不是文章，仍用 submit_draft 如实说明。"
)


def _dispatch_tool(name: str, args: dict, fetch_transport=None) -> dict:
    """执行单个工具调用；抓取错误吞成结果回喂 agent（不外抛）"""
    try:
        if name == "fetch_page":
            res = fetch_page(args["url"], transport=fetch_transport)
            return {"ok": True, "url": res["url"], "html": res["html"][: settings.summarize_max_bytes]}
        if name == "extract_main_text":
            title, text = extract_main_text(args.get("html", ""))
            return {"ok": True, "title": title, "text": text}
        return {"ok": False, "error": f"未知工具：{name}"}
    except (FetchError, ValueError) as e:
        return {"ok": False, "error": str(e)}


def summarize_url(
    url: str,
    *,
    fetch_transport: httpx.BaseTransport | None = None,
    llm_transport: httpx.BaseTransport | None = None,
) -> dict:
    """agent 主循环：返回 {url, title, summary, suggested_tags}。
    入口 URL 预校验（违规 ValueError）；触顶迭代/超时 → SummarizeError。"""
    validate_url(url)  # 入口预校验，给用户清晰错误
    deadline = time.monotonic() + settings.summarize_timeout_seconds
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": f"请总结这个链接：{url}"},
    ]
    for _ in range(settings.summarize_max_iters):
        if time.monotonic() > deadline:
            raise SummarizeError("总结超时", kind="timeout")
        resp = chat_with_tools(messages, TOOLS, transport=llm_transport)
        msg = resp["choices"][0]["message"]
        tool_calls = msg.get("tool_calls")
        # assistant 消息原样回填（含 tool_calls 才符合 OpenAI 对话约束）
        assistant: dict = {"role": "assistant", "content": msg.get("content")}
        if tool_calls:
            assistant["tool_calls"] = tool_calls
        messages.append(assistant)
        if not tool_calls:
            # 没调工具也没 submit：模型想结束但没产出结构化草稿
            raise SummarizeError("模型未产出草稿", kind="no_draft")
        # 派发每个工具调用
        for tc in tool_calls:
            fn = tc["function"]["name"]
            args = json.loads(tc["function"].get("arguments") or "{}")
            if fn == "submit_draft":
                return {
                    "url": url,
                    "title": args.get("title", ""),
                    "summary": args.get("summary", ""),
                    "suggested_tags": args.get("suggested_tags", []) or [],
                }
            result = _dispatch_tool(fn, args, fetch_transport)
            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": json.dumps(result, ensure_ascii=False),
            })
            if time.monotonic() > deadline:
                raise SummarizeError("总结超时", kind="timeout")
    raise SummarizeError("达到最大迭代次数仍未完成", kind="max_iters")
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd apps/api && uv run pytest tests/test_summarize.py -v`
Expected: PASS（22 条）。

- [ ] **Step 5: 提交**

```bash
git add apps/api/app/services/summarize_service.py apps/api/tests/test_summarize.py
git commit -m "feat(api): summarize_url agent 工具调用循环(fetch+extract+submit_draft)"
```

---

## Task 8：RateLimiter — 内存级 per-user 滑动窗口

**Files:**
- Create: `apps/api/app/services/rate_limiter.py`
- Test: `apps/api/tests/test_summarize.py`

- [ ] **Step 1: 写失败测试**

在 `tests/test_summarize.py` 顶部追加导入：

```python
from app.services.rate_limiter import RateLimiter
```

追加测试（注入 `now`，确定性、不真实 sleep）：

```python
def test_rate_limiter_allows_until_limit():
    """窗口内前 N 次放行，第 N+1 次拒绝"""
    rl = RateLimiter(max_calls=3, window_seconds=60)
    assert rl.allow("alice", now=1.0) is True
    assert rl.allow("alice", now=2.0) is True
    assert rl.allow("alice", now=3.0) is True
    assert rl.allow("alice", now=4.0) is False  # 第 4 次拒绝


def test_rate_limiter_window_slides():
    """超出窗口后旧命中失效，重新放行"""
    rl = RateLimiter(max_calls=2, window_seconds=10)
    assert rl.allow("a", now=0.0) is True
    assert rl.allow("a", now=5.0) is True
    assert rl.allow("a", now=6.0) is False
    assert rl.allow("a", now=11.0) is True  # 0.0 的命中已出窗


def test_rate_limiter_keys_independent():
    """不同用户互不影响"""
    rl = RateLimiter(max_calls=1, window_seconds=60)
    assert rl.allow("a", now=1.0) is True
    assert rl.allow("b", now=1.0) is True
    assert rl.allow("a", now=1.0) is False
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd apps/api && uv run pytest tests/test_summarize.py -v`
Expected: FAIL（`rate_limiter` 模块不存在）。

- [ ] **Step 3: 实现 RateLimiter**

创建 `apps/api/app/services/rate_limiter.py`：

```python
# 内存级 per-user 滑动窗口限流（网页总结用）
# 注意：多 worker 部署下每个 worker 各自计数 → 近似（个人项目够用）
import time
from collections import defaultdict, deque


class RateLimiter:
    """简单的 per-key 滑动窗口限流器。

    allow(key, now)：窗口内未超 max_calls 则记一次并返回 True，否则 False。
    now 可注入以便测试（默认 time.monotonic()）。"""

    def __init__(self, max_calls: int, window_seconds: float):
        self.max_calls = max_calls
        self.window = window_seconds
        # 每个 key 维护一个命中时间戳的双端队列
        self._hits: dict[str, deque] = defaultdict(deque)

    def allow(self, key: str, now: float | None = None) -> bool:
        t = now if now is not None else time.monotonic()
        dq = self._hits[key]
        # 清掉窗口外的旧命中
        cutoff = t - self.window
        while dq and dq[0] <= cutoff:
            dq.popleft()
        if len(dq) >= self.max_calls:
            return False
        dq.append(t)
        return True
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd apps/api && uv run pytest tests/test_summarize.py -v`
Expected: PASS（25 条）。

- [ ] **Step 5: 提交**

```bash
git add apps/api/app/services/rate_limiter.py apps/api/tests/test_summarize.py
git commit -m "feat(api): RateLimiter 内存级 per-user 滑动窗口"
```

---

## Task 9：schema + 路由 POST /api/summarize + 注册

**Files:**
- Create: `apps/api/app/schemas/summarize.py`
- Create: `apps/api/app/routers/summarize.py`
- Modify: `apps/api/app/main.py`
- Test: `apps/api/tests/test_summarize.py`

> 路由：503 未配置 / 429 限流 / 400 URL 非法 / 504 触顶 / 502 LLM 故障 / 200 成功。成功/触顶/故障用 monkeypatch 服务函数，避免真实网络。

- [ ] **Step 1: 写失败测试**

在 `tests/test_summarize.py` 顶部追加导入：

```python
from tests.helpers import register_and_login
```

追加测试（路由层）：

```python
def _h(token):
    return {"Authorization": f"Bearer {token}"}


def test_summarize_503_when_unconfigured(client, monkeypatch):
    """LLM_* 未配置 → 503"""
    monkeypatch.setattr(ss.settings, "llm_base_url", "")
    token = register_and_login(client)
    r = client.post("/api/summarize", json={"url": "https://example.com/"}, headers=_h(token))
    assert r.status_code == 503


def test_summarize_400_bad_url(client, monkeypatch):
    """非 http(s) scheme → 400"""
    monkeypatch.setattr(ss.settings, "llm_base_url", "http://llm/v1")
    monkeypatch.setattr(ss.settings, "llm_api_key", "k")
    monkeypatch.setattr(ss.settings, "llm_model", "m")
    token = register_and_login(client)
    r = client.post("/api/summarize", json={"url": "file:///etc/passwd"}, headers=_h(token))
    assert r.status_code == 400


def test_summarize_422_empty_url(client, monkeypatch):
    """空 URL → Pydantic 422"""
    monkeypatch.setattr(ss.settings, "llm_base_url", "http://llm/v1")
    monkeypatch.setattr(ss.settings, "llm_api_key", "k")
    monkeypatch.setattr(ss.settings, "llm_model", "m")
    token = register_and_login(client)
    r = client.post("/api/summarize", json={"url": ""}, headers=_h(token))
    assert r.status_code == 422


def test_summarize_429_rate_limited(client, monkeypatch):
    """超 per-user 限流 → 429"""
    _llm_settings(monkeypatch)
    # 把路由里的限流器换成 1 次/窗口
    from app.routers import summarize as router_mod
    from app.services.rate_limiter import RateLimiter
    monkeypatch.setattr(router_mod, "_limiter", RateLimiter(1, 60))
    token = register_and_login(client)
    # 第一发：mock 服务返回草稿（成功）
    monkeypatch.setattr(ss, "summarize_url", lambda url, **kw: {"url": url, "title": "T", "summary": "S", "suggested_tags": []})
    assert client.post("/api/summarize", json={"url": "https://example.com/"}, headers=_h(token)).status_code == 200
    # 第二发：限流
    r = client.post("/api/summarize", json={"url": "https://example.com/"}, headers=_h(token))
    assert r.status_code == 429


def test_summarize_504_timeout(client, monkeypatch):
    """agent 触顶/超时 → 504"""
    _llm_settings(monkeypatch)

    def boom(url, **kw):
        raise ss.SummarizeError("超时", kind="timeout")

    monkeypatch.setattr(ss, "summarize_url", boom)
    token = register_and_login(client)
    r = client.post("/api/summarize", json={"url": "https://example.com/"}, headers=_h(token))
    assert r.status_code == 504


def test_summarize_502_llm_failure(client, monkeypatch):
    """LLM 端点故障 → 502"""
    _llm_settings(monkeypatch)

    def boom(url, **kw):
        raise ss.LLMError("down", kind="http")

    monkeypatch.setattr(ss, "summarize_url", boom)
    token = register_and_login(client)
    r = client.post("/api/summarize", json={"url": "https://example.com/"}, headers=_h(token))
    assert r.status_code == 502


def test_summarize_200_returns_draft(client, monkeypatch):
    """成功 → 200 + 草稿"""
    _llm_settings(monkeypatch)
    monkeypatch.setattr(ss, "summarize_url", lambda url, **kw: {
        "url": url, "title": "标题", "summary": "总结正文", "suggested_tags": ["a", "b"]})
    token = register_and_login(client)
    r = client.post("/api/summarize", json={"url": "https://example.com/"}, headers=_h(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["title"] == "标题"
    assert body["suggested_tags"] == ["a", "b"]
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd apps/api && uv run pytest tests/test_summarize.py -v`
Expected: FAIL（路由不存在 → 404，schema 模块缺失）。

- [ ] **Step 3: 建 schema**

创建 `apps/api/app/schemas/summarize.py`：

```python
# 网页总结的请求/草稿模型
from pydantic import BaseModel, Field


class SummarizeRequest(BaseModel):
    # 用 str + 服务端 validate_url 校验，便于给出中文 400；空串由 Pydantic 422 兜住
    url: str = Field(min_length=1)


class SummarizeDraft(BaseModel):
    url: str
    title: str
    summary: str
    suggested_tags: list[str] = []
```

- [ ] **Step 4: 实现路由**

创建 `apps/api/app/routers/summarize.py`：

```python
# 网页总结路由：agent 抓取+总结一条链接，返回草稿（不落库）
# 503 未配置 / 429 限流 / 400 URL 非法 / 504 触顶 / 502 LLM 故障 / 200 成功
from fastapi import APIRouter, Depends, HTTPException

from app.auth.deps import get_current_user
from app.config import settings
from app.models.user import User
from app.schemas.summarize import SummarizeDraft, SummarizeRequest
from app.services import summarize_service as svc
from app.services.rate_limiter import RateLimiter

router = APIRouter(prefix="/api", tags=["summarize"])

# per-user 内存限流器（多 worker 下各自计数，近似）
_limiter = RateLimiter(settings.summarize_rate_limit, settings.summarize_rate_window_seconds)


@router.post("/summarize", response_model=SummarizeDraft)
def summarize(payload: SummarizeRequest, user: User = Depends(get_current_user)):
    """总结一条链接，返回草稿（不落库）。详见 ADR-001/002。"""
    # 1) 功能开关：LLM_* 三件任一未配置 → 503
    if not (settings.llm_base_url and settings.llm_api_key and settings.llm_model):
        raise HTTPException(503, "网页总结未配置（需设置 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL）")
    # 2) per-user 限流 → 429
    if not _limiter.allow(user.username):
        raise HTTPException(429, "请求过于频繁，请稍后再试")
    # 3) 入口 URL 预校验 → 400（给用户清晰错误，不进 agent）
    try:
        svc.validate_url(payload.url)
    except ValueError as e:
        raise HTTPException(400, str(e))
    # 4) 跑 agent
    try:
        return svc.summarize_url(payload.url)
    except svc.SummarizeError as e:
        # 触顶/超时 → 504；其余（no_draft 等）→ 422
        code = 504 if e.kind in ("timeout", "max_iters") else 422
        raise HTTPException(code, str(e))
    except svc.LLMError as e:
        # 端点故障 → 502（unconfigured 理论上已被开关拦下，留作保险）
        raise HTTPException(502, str(e))
```

- [ ] **Step 5: 注册路由**

修改 `apps/api/app/main.py`，import 区加（与 wiki 同处）：

```python
from app.routers import summarize as summarize_router
```

挂载区（`wiki_router` 之后）加：

```python
# 挂载网页总结路由（agent 抓取+总结链接）
app.include_router(summarize_router.router)
```

- [ ] **Step 6: 运行测试，确认通过**

Run: `cd apps/api && uv run pytest tests/test_summarize.py -v`
Expected: PASS（32 条）。再跑全量确认无回归：`cd apps/api && uv run pytest`。

- [ ] **Step 7: 提交**

```bash
git add apps/api/app/schemas/summarize.py apps/api/app/routers/summarize.py apps/api/app/main.py apps/api/tests/test_summarize.py
git commit -m "feat(api): POST /api/summarize 网页总结路由(503/429/400/504/502/200)"
```

---

## Task 10：后端全量测试

**Files:** 无新增。

- [ ] **Step 1: 全量**

Run: `cd apps/api && uv run pytest`
Expected: 全绿（新增 `tests/test_summarize.py` 32 条 + 原有用例无回归）。

- [ ] **Step 2: 接入冒烟（可选，需真实端点）**

在 `apps/api/.env` 配齐 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`（模型需支持 function-calling），起后端，`curl` 一发：

```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/"}'
```
Expected: 200 + 草稿（坐实端点能力前提）。验证后清掉临时 env。

---

## Task 11：前端 `api/summarize.ts`（axios 封装 + 契约测试）

**Files:**
- Create: `apps/web/src/api/summarize.ts`
- Test: `apps/web/src/test/summarize.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/web/src/test/summarize.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// 桩掉 axios 实例：只关心 summarizeLink 调对 URL、透传返回值
vi.mock("../api/client", () => ({
  __esModule: true,
  default: { post: vi.fn() },
}));

import api from "../api/client";
import { summarizeLink } from "../api/summarize";

describe("summarizeLink", () => {
  beforeEach(() => (api.post as any).mockReset());

  it("POST /api/summarize 带 {url} 并回传草稿", async () => {
    (api.post as any).mockResolvedValue({
      data: { url: "https://x", title: "T", summary: "S", suggested_tags: ["a"] },
    });
    const r = await summarizeLink("https://x");
    expect(api.post).toHaveBeenCalledWith("/api/summarize", { url: "https://x" });
    expect(r).toEqual({ url: "https://x", title: "T", summary: "S", suggested_tags: ["a"] });
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm --filter web test -- --run src/test/summarize.test.ts`
Expected: FAIL（`../api/summarize` 不存在）。

- [ ] **Step 3: 实现 api/summarize.ts**

创建 `apps/web/src/api/summarize.ts`：

```ts
import api from "./client";

// 网页总结返回的草稿（与后端 SummarizeDraft 一致；不落库）
export interface SummarizeDraft {
  url: string;
  title: string;
  summary: string;
  suggested_tags: string[];
}

// 把链接交给后端 agent 抓取+总结，返回草稿
export async function summarizeLink(url: string): Promise<SummarizeDraft> {
  const { data } = await api.post<SummarizeDraft>("/api/summarize", { url });
  return data;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter web test -- --run src/test/summarize.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/api/summarize.ts apps/web/src/test/summarize.test.ts
git commit -m "feat(web): summarizeLink api 封装"
```

---

## Task 12：SummarizeDialog 组件

**Files:**
- Create: `apps/web/src/components/SummarizeDialog.tsx`

> 承编辑器先例：弹窗是编排组件，**手动验证**，不加单测。状态：URL 输入 → 加载 → 可编辑预览（标题/总结/标签）→ 保存。建议标签支持「一键应用」（缺失则按名创建）。保存 content = 源链接 + 总结，走 `useCreateNote`。

- [ ] **Step 1: 实现 SummarizeDialog**

创建 `apps/web/src/components/SummarizeDialog.tsx`：

```tsx
// 从链接总结：弹窗。粘贴链接→后端 agent 总结→可编辑预览→保存为笔记。
// content = 源链接 + 总结；建议标签可一键应用（缺失则按名创建）。承编辑器先例手动验证。
import { useState } from "react";
import { Link2, Loader2, Sparkles, X } from "lucide-react";
import { summarizeLink, type SummarizeDraft } from "../api/summarize";
import { createTag } from "../api/tags";
import { useCreateNote } from "../hooks/useNotes";
import { useTags } from "../hooks/useTags";
import { useQueryClient } from "@tanstack/react-query";
import { TAGS_KEY } from "../hooks/useTags";
import TagPicker from "./TagPicker";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (noteId: number) => void;
}

type Phase = "input" | "loading" | "preview";

export default function SummarizeDialog({ open, onClose, onSaved }: Props) {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [draft, setDraft] = useState<SummarizeDraft | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const createNote = useCreateNote();
  const { data: tags = [] } = useTags();
  const qc = useQueryClient();

  if (!open) return null;

  function reset() {
    setUrl("");
    setPhase("input");
    setDraft(null);
    setTitle("");
    setSummary("");
    setTagIds([]);
    setError("");
  }

  function close() {
    reset();
    onClose();
  }

  // 调后端总结
  async function run() {
    if (!url.trim()) return;
    setPhase("loading");
    setError("");
    try {
      const d = await summarizeLink(url.trim());
      setDraft(d);
      setTitle(d.title);
      setSummary(d.summary);
      setTagIds([]);
      setPhase("preview");
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "总结失败，请稍后再试");
      setPhase("input");
    }
  }

  // 按名确保标签存在（缺失则创建），返回 id
  async function ensureTag(name: string): Promise<number> {
    const hit = tags.find((t) => t.name === name);
    if (hit) return hit.id;
    const t = await createTag(name);
    qc.invalidateQueries({ queryKey: TAGS_KEY });
    return t.id;
  }

  // 一键应用建议标签
  async function applySuggested() {
    if (!draft?.suggested_tags?.length) return;
    try {
      const ids = await Promise.all(draft.suggested_tags.map(ensureTag));
      setTagIds(Array.from(new Set([...tagIds, ...ids])));
    } catch {
      setError("部分标签应用失败");
    }
  }

  // 保存为笔记：content = 源链接 + 总结
  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const content = `> 来源：[${draft.url}](${draft.url})\n\n${summary}`;
      const note = await createNote.mutateAsync({
        title: title || draft.title || "无标题",
        content,
        tag_ids: tagIds,
      });
      onSaved(note.id);
      close();
    } catch {
      setError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant">
          <div className="flex items-center gap-2 text-on-surface font-semibold">
            <Sparkles className="w-4 h-4 text-primary" />
            <span>从链接总结</span>
          </div>
          <button onClick={close} title="关闭" className="p-1 rounded-md text-on-surface-variant hover:bg-surface-container-low">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-3">
          {/* URL 输入 */}
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 border border-outline-variant rounded-md focus-within:border-primary">
              <Link2 className="w-4 h-4 text-outline-variant" />
              <input
                autoFocus
                placeholder="粘贴链接，如 https://example.com/article"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && phase === "input" && run()}
                disabled={phase !== "input"}
                className="flex-1 text-sm bg-transparent focus:outline-none disabled:text-on-surface-variant"
              />
            </div>
            {phase === "input" && (
              <button
                onClick={run}
                disabled={!url.trim()}
                className="px-4 py-2 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-md disabled:opacity-60"
              >
                总结
              </button>
            )}
          </div>

          {phase === "loading" && (
            <div className="flex items-center gap-2 text-on-surface-variant text-sm py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>正在抓取并总结…（最长约 1 分钟）</span>
            </div>
          )}

          {phase === "preview" && draft && (
            <>
              <div>
                <label className="text-xs text-on-surface-variant">标题</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full text-sm px-3 py-2 border border-outline-variant rounded-md focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex-1 flex flex-col">
                <label className="text-xs text-on-surface-variant">总结（可编辑，保存后进入笔记正文）</label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="mt-1 w-full flex-1 min-h-[180px] text-sm px-3 py-2 border border-outline-variant rounded-md focus:outline-none focus:border-primary resize-none font-mono"
                />
              </div>
              {/* 建议标签：一键应用 + 现有 TagPicker */}
              {draft.suggested_tags?.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-on-surface-variant">建议标签：</span>
                  {draft.suggested_tags.map((t) => (
                    <span key={t} className="px-2 py-0.5 text-xs bg-surface-container-low text-on-surface-variant rounded">
                      # {t}
                    </span>
                  ))}
                  <button onClick={applySuggested} className="text-xs text-primary hover:underline">
                    一键应用
                  </button>
                </div>
              )}
              <div>
                <TagPicker selected={tagIds} onChange={setTagIds} />
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        {/* 底栏 */}
        {phase === "preview" && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-outline-variant">
            <button onClick={close} className="px-3 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container-low rounded-md">
              取消
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-md disabled:opacity-60"
            >
              {saving ? "保存中…" : "保存为笔记"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/web/src/components/SummarizeDialog.tsx
git commit -m "feat(web): SummarizeDialog 弹窗(总结→预览→保存为笔记)"
```

---

## Task 13：Sidebar 按钮 + NotesPage 接线

**Files:**
- Modify: `apps/web/src/components/Sidebar.tsx`
- Modify: `apps/web/src/pages/NotesPage.tsx`

> 手动验证。

- [ ] **Step 1: Sidebar 加按钮 + onSummarize prop**

修改 `apps/web/src/components/Sidebar.tsx`：

import 区加图标：

```tsx
import { Plus, FileText, Tag, Star, Trash2, Settings, Info, LogOut, Link2 } from "lucide-react";
```

`Props` 接口加一个回调：

```tsx
interface Props {
  selectedTagId: number | null;
  onSelectTag: (id: number | null) => void;
  onCreate: () => void;
  onSummarize: () => void; // 打开「从链接总结」弹窗
}
```

函数签名加参数：

```tsx
export default function Sidebar({ selectedTagId, onSelectTag, onCreate, onSummarize }: Props) {
```

在「新建笔记」按钮所在的 `px-4 mb-6` 容器里，紧接「新建笔记」按钮之后追加：

```tsx
        <button
          onClick={onSummarize}
          className="w-full mt-2 border border-outline-variant hover:bg-surface-container-low text-on-surface font-medium px-4 rounded-md flex items-center justify-center gap-2 transition-colors py-1.5 text-sm"
        >
          <Link2 className="w-[18px] h-[18px]" />
          <span>从链接总结</span>
        </button>
```

- [ ] **Step 2: NotesPage 接线弹窗**

修改 `apps/web/src/pages/NotesPage.tsx`，import 区加：

```tsx
import { useState } from "react";
import SummarizeDialog from "../components/SummarizeDialog";
```

（`useState` 已在用，合并即可。）

组件内加状态：

```tsx
  const [summarizeOpen, setSummarizeOpen] = useState(false);
```

给 `<Sidebar ... />` 加 `onSummarize`：

```tsx
      <Sidebar
        selectedTagId={tagId}
        onSelectTag={setTagId}
        onCreate={handleCreate}
        onSummarize={() => setSummarizeOpen(true)}
      />
```

在 `<NoteEditor />` 之后渲染弹窗：

```tsx
      <SummarizeDialog
        open={summarizeOpen}
        onClose={() => setSummarizeOpen(false)}
        onSaved={(id) => setSelectedId(id)}
      />
```

- [ ] **Step 3: 手动验证**

Run: `pnpm dev`。
- 未配 `LLM_*` → 点「从链接总结」→ 粘贴链接 → 「总结」→ 红色 `网页总结未配置…`（503）。✅
- 临时配齐 `apps/api/.env` 的 `LLM_*`（模型支持 function-calling），重启后端 → 粘贴一个公网文章链接 → 「总结」→ 加载 → 预览出标题/总结/建议标签 → 编辑 → 「一键应用」标签 → 「保存为笔记」→ 弹窗关闭、左侧列表出现新笔记、正文顶部为 `> 来源：[url](url)`、其下为总结。✅
- 短链（如 `https://bit.ly/...`）→ 能跟随重定向并总结（逐跳校验生效）。✅
- 粘贴 `file:///etc/passwd` → 红色 `仅允许 http/https…`（400）。✅
- 验证后清掉临时 env，停止 dev。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/components/Sidebar.tsx apps/web/src/pages/NotesPage.tsx
git commit -m "feat(web): Sidebar「从链接总结」入口 + NotesPage 接线"
```

---

## Task 14：前端全量测试 + 类型检查 + 构建

**Files:** 无新增。

- [ ] **Step 1: 前端全量测试**

Run: `pnpm --filter web test -- --run`
Expected: 全绿（含新增 `src/test/summarize.test.ts`）。

- [ ] **Step 2: 类型检查 + 构建**

Run: `pnpm --filter web build`
Expected: `tsc -b` 与 `vite build` 均无错。

---

## Task 15：部署配置（compose env + deploy 文档）

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docs/deploy.md`

> 无单测（基础设施）。改动后 `docker compose config` 校验语法。

- [ ] **Step 1: compose 加 LLM env**

修改 `docker-compose.yml` 的 `api` 服务 `environment` 列表，在 wiki env 之后追加：

```yaml
      # —— 网页总结（agent 抓取+总结；不填则功能关闭，端点返回 503）——
      LLM_BASE_URL: ${LLM_BASE_URL:-}
      LLM_API_KEY: ${LLM_API_KEY:-}
      LLM_MODEL: ${LLM_MODEL:-}
```

> 不需要新挂卷（不写服务器文件）。`api` 容器需能出网抓取用户链接、访问 LLM 端点（Caddy 反代不涉及，因为是 api 直连外网/内网 LLM）。

- [ ] **Step 2: deploy.md 加一小节**

修改 `docs/deploy.md`，在「发布笔记到 LLM Wiki」小节之后插入：

```markdown
## 8.6 网页总结（从链接总结，可选）

让用户粘贴一条链接，后端 agent 抓取并总结成草稿，确认后保存为笔记（content 自带源链接溯源）。

1. 准备一个 OpenAI 兼容端点（如服务器上的 Open WebUI），且所用**模型支持 function-calling**。
2. 在根 `.env` 填：
   ```bash
   LLM_BASE_URL=http://open-webui:3000/v1   # 以 /v1 结尾
   LLM_API_KEY=<你的 key>
   LLM_MODEL=<支持工具调用的模型名>
   ```
3. `docker compose up -d --build api` 重建后端。
4. 登录笔记应用，点左栏「从链接总结」，粘贴一条公网文章链接，应出标题/总结/建议标签，编辑后可保存为笔记。

> 抓取做了 SSRF 防护（scheme 白名单 + DNS 解析后屏蔽内网/环回/链路本地 IP + 重定向逐跳重校验 + 体积/超时上限），见 ADR-002；采用真·agent 工具调用循环（非写死管线），见 ADR-001。未配置 `LLM_*` 时端点返回 503。
```

- [ ] **Step 3: 校验 compose 语法**

Run: `docker compose config >/dev/null && echo OK`
Expected: 打印 `OK`。

- [ ] **Step 4: 提交**

```bash
git add docker-compose.yml docs/deploy.md
git commit -m "feat(deploy): 网页总结 LLM env + 文档"
```

---

## 自审（Self-Review）

**1. 设计决策覆盖（对照访谈结论 + ADR-001/002 + CONTEXT）：**
- 总结后端=OpenAI 兼容端点 → Task 6 chat_with_tools + Task 2 config `llm_*`。✓
- 真·agent 工具调用循环（非管线）→ Task 7 summarize_url + ADR-001。✓
- 工具集最小：fetch_page + extract_main_text + submit_draft（终答）→ Task 7 TOOLS。✓
- httpx 手写循环（端点支持 function-calling 为前提）→ Task 6/7；Task 10 Step 2 冒烟坐实。✓
- SSRF 防护（scheme+DNS+IP 段+逐跳重定向+体积/类型/超时）→ Task 3/5 + ADR-002。✓
- 访问控制=全员可用 + 503 + 内存限流 + loop 上限 → Task 8/9。✓
- 草稿不落库、保存走现有 createNote → Task 9/12（save 用 useCreateNote）。✓
- 笔记 content = 源链接 + 总结（自带溯源）→ Task 12 save。✓
- 前端 Sidebar 按钮→弹窗、同步等待 → Task 12/13。✓
- config 重命名 LLM_* + 修 CLAUDE.md 悬空 HERMES_API_KEY → Task 2。✓
- 错误矩阵 503/429/400/422/504/502/200 → Task 9 全覆盖。✓

**2. 占位符扫描：** 无 TBD/TODO；每个代码步含完整可运行代码；Task 5 的 `monkeypatch_settings_max_bytes` fixture 是测试签名占位（实现时可精简掉该参数），已在注释标明；Task 10 Step 2 / Task 13 Step 3 的「手动/冒烟」是有意为之（真实端点 + 编排组件），非占位。

**3. 类型/契约一致性：**
- 后端 `summarize_url` 返回 `{url,title,summary,suggested_tags}`（Task 7）↔ schema `SummarizeDraft` 同字段（Task 9）↔ 路由 `response_model=SummarizeDraft`（Task 9）↔ 前端 `SummarizeDraft` 同字段（Task 11）。✓
- 配置字段 `llm_*`/`summarize_*`（Task 2）↔ service 读 `settings.*`（Task 5/6/7）↔ compose env `LLM_*`（Task 15）↔ 测试 monkeypatch 同名（Task 6/9）。✓
- 路由路径 `POST /api/summarize` ↔ 前端 `api.post("/api/summarize", {url})`（Task 11）↔ 契约断言（Task 11）。✓
- 工具调用对话结构（assistant 带 tool_calls、tool 消息带 tool_call_id）符合 OpenAI 约束（Task 7）。✓
- `submit_draft` 即终止 ↔ 测试 happy_path 第三轮返回草稿（Task 7）。✓

**4. 安全复核（ADR-002）：** scheme 白名单（Task 3）、DNS 后 IP 段屏蔽含 169.254.169.254（Task 3 测试）、逐跳重定向重校验含「重定向到内网被挡」（Task 5 测试）、体积上限（Task 5 测试）、Content-Type 闸门（Task 5 测试）、入口预校验给 400（Task 9）。已知残留：TOCTOU DNS-rebinding 未做完整 IP-pinning（ADR-002 已记）。✓
