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
