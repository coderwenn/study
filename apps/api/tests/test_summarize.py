# 网页总结：SSRF 守卫 / 抽取 / fetch / agent 循环 / 路由 测试
import json
import socket

import httpx
import pytest

from app.services import summarize_service as ss
from app.services.summarize_service import extract_main_text, fetch_page
from app.services.summarize_service import chat_with_tools, summarize_url
from app.services.rate_limiter import RateLimiter


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


# —— fetch_page：SSRF + 逐跳重定向 + 体积/类型闸门 ——


def _pub_dns(monkeypatch):
    """公网 DNS 桩（避免真实解析）"""
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


# —— chat_with_tools：LLM 客户端 ——


def _llm_settings(monkeypatch):
    """注入完整 LLM 配置（三件全填），供多任务复用"""
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

    resp = chat_with_tools(
        [{"role": "user", "content": "x"}],
        [{"type": "function", "function": {"name": "f"}}],
        transport=httpx.MockTransport(handler),
    )
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


# —— summarize_url：agent 工具调用循环 ——


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
        200, headers={"content-type": "text/html"},
        content="<html><head><title>T</title></head><body><p>正文ABC</p></body></html>".encode("utf-8"),
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


# —— RateLimiter：内存级 per-user 滑动窗口 ——


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
