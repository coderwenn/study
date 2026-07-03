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


def _yaml_str(s: str) -> str:
    """转成双引号 YAML 标量：转义反斜杠与双引号，规避冒号/引号导致的解析歧义"""
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def render_wiki_source(note) -> str:
    """把笔记渲染成 Wiki Source 的完整 .md：轻量溯源 frontmatter + H1 + 原文"""
    created = note.created_at.date().isoformat()
    updated = note.updated_at.date().isoformat()
    # 标签作为 YAML inline list（每个名字都转义）；无标签则空
    tags = ", ".join(_yaml_str(t.name) for t in note.tags) if note.tags else ""
    fm = (
        "---\n"
        f"title: {_yaml_str(note.title)}\n"
        "source: notes-app\n"
        f"note_id: {note.id}\n"
        f"created: {created}\n"
        f"updated: {updated}\n"
        f"tags: [{tags}]\n"
        "---\n"
    )
    return f"{fm}# {note.title}\n\n{note.content}\n"


def publish_note(note) -> dict:
    """把笔记作为 Wiki Source 写进 entries/，返回 {path, slug, overwritten}。
    原子写（临时文件 + os.replace）防 Hermes 并发读到半截；可选 chown 成宿主机 uid。"""
    base = Path(settings.wiki_entries_path)
    slug = make_slug(note.title, note.id)
    target = base / f"{slug}.md"
    overwritten = target.exists()
    # 目录可能不存在（首次发布）
    base.mkdir(parents=True, exist_ok=True)
    # 临时文件用 pid 命名，避免并发发布互相踩
    tmp = base / f".{slug}.{os.getpid()}.tmp"
    tmp.write_text(render_wiki_source(note), encoding="utf-8")
    os.replace(tmp, target)  # 原子替换
    os.chmod(target, 0o644)
    # 配置了宿主机 uid/gid 才 chown（容器需以 root 运行；见 ADR-001）
    if settings.wiki_uid or settings.wiki_gid:
        os.chown(target, settings.wiki_uid, settings.wiki_gid)
    return {"path": str(target), "slug": slug, "overwritten": overwritten}
