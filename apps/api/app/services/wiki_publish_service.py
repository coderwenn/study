# 把笔记物化为 Wiki Source 文件，写进 llm-wiki 的 entries/ 目录
# 详见 docs/superpowers/specs/2026-07-03-publish-to-wiki-adr-001.md
import os
import re
from pathlib import Path

from app.config import settings

# 文件名 / 同步不友好的字符：ASCII 非法 + 全角标点 + 控制字符
# 替换为空格后折叠成 -（例：全角冒号 -> -），而不是直接删（更可读）
# 全角标点一律用 \u 转义，避免与 ASCII 标点视觉混淆导致漏写/误写
#   ：=： ？=？ “=“ ”=”
_ILLEGAL_RE = re.compile(r'[":*?<>|/\\：？“”\x00-\x1f]')
# 任意空白（含全角空格 　）折叠为单个 -
_WS_RE = re.compile(r"[\s　]+")


def make_slug(title: str, note_id: int) -> str:
    """标题 -> 文件名 slug：保留中文，非法字符替换为空格再折叠为 -，
    拉丁字母小写；结果为空则回退 note-{id}。"""
    s = (title or "").strip()
    # 非法字符替换成空格（便于后续折叠成 -）
    s = _ILLEGAL_RE.sub(" ", s)
    # 空白折叠为单个 -，并去掉首尾 -
    s = _WS_RE.sub("-", s).strip("-")
    # 拉丁字母小写（CJK 无影响）
    s = s.lower()
    return s or f"note-{note_id}"
