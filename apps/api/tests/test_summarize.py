# 网页总结：SSRF 守卫 / 抽取 / fetch / agent 循环 / 路由 测试
import socket

import pytest

from app.services import summarize_service as ss
from app.services.summarize_service import extract_main_text


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
