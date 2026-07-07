# 网页总结：SSRF 守卫 + 抽取 + fetch + LLM 工具调用循环（agent）
# 详见 ADR-001（agent over 管线）、ADR-002（SSRF 防护）、CONTEXT.md
import ipaddress
import re
import socket
from urllib.parse import urlparse

import httpx
import trafilatura

from app.config import settings

# 只放行 http/https，挡掉 file/gopher/data/ftp 等
_ALLOWED_SCHEMES = {"http", "https"}


class SummarizeError(Exception):
    """agent 循环层错误（终止映射到 504/422）。kind: timeout/max_iters/no_draft"""
    def __init__(self, message: str, kind: str = "no_draft"):
        super().__init__(message)
        self.kind = kind


class FetchError(Exception):
    """抓取层错误（被工具吞掉回喂给 agent，一般不外抛）。kind: http/redirect/content_type/too_large/ssrf"""
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
