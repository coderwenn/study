# Wiki 发布：服务层（slug/渲染/写文件）与路由测试
from datetime import datetime
from types import SimpleNamespace

from app.config import settings
from app.services.wiki_publish_service import make_slug, publish_note, render_wiki_source


def _note(**kw):
    """构造一个满足 wiki_publish_service 需要的「假笔记」（duck-typed）"""
    base = dict(
        id=1,
        title="占位",
        content="",
        created_at=datetime(2026, 6, 10, 12, 0, 0),
        updated_at=datetime(2026, 7, 3, 9, 0, 0),
        tags=[],
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_make_slug_chinese_with_punct():
    """中文 + 全角冒号：冒号变空格再折叠为 -"""
    assert make_slug("读书笔记：深度学习", 1) == "读书笔记-深度学习"


def test_make_slug_collapse_whitespace_and_lower():
    """连续空白折叠为单个 -；拉丁字母小写"""
    assert make_slug("Hello   World", 1) == "hello-world"


def test_make_slug_illegal_to_dash():
    """文件系统非法字符替换为空格再折叠为 -（与全角标点行为一致）"""
    assert make_slug("a/b\\c*d?e", 1) == "a-b-c-d-e"


def test_make_slug_empty_fallback_note_id():
    """全非法/空标题 → 回退 note-{id}"""
    assert make_slug("？？？", 1) == "note-1"
    assert make_slug("   ", 2) == "note-2"


def test_render_basic_frontmatter_and_body():
    """渲染：frontmatter 字段齐全 + H1 + 原文"""
    note = _note(
        id=42,
        title="读书笔记",
        content="正文第一行",
        tags=[SimpleNamespace(name="ML"), SimpleNamespace(name="笔记")],
    )
    out = render_wiki_source(note)
    # frontmatter 边界
    assert out.startswith("---\n")
    assert out.count("---\n") >= 2
    # 必填字段
    assert 'title: "读书笔记"' in out
    assert "source: notes-app" in out
    assert "note_id: 42" in out
    assert "created: 2026-06-10" in out
    assert "updated: 2026-07-03" in out
    assert 'tags: ["ML", "笔记"]' in out
    # 正文：H1 + 原文
    assert "# 读书笔记" in out
    assert out.rstrip().endswith("正文第一行")


def test_render_quotes_title_with_colon():
    """标题含 ASCII 冒号 → frontmatter 用双引号转义，避免 YAML 解析歧义"""
    note = _note(id=1, title="a: b", content="")
    out = render_wiki_source(note)
    assert 'title: "a: b"' in out


def test_render_no_tags_empty_list():
    """无标签 → tags: []"""
    out = render_wiki_source(_note(id=1, title="t", content=""))
    assert "tags: []" in out


def test_publish_writes_file_and_returns_path(tmp_path, monkeypatch):
    """写文件成功，返回 path/slug/overwritten=False"""
    monkeypatch.setattr(settings, "wiki_entries_path", str(tmp_path))
    monkeypatch.setattr(settings, "wiki_uid", 0)
    monkeypatch.setattr(settings, "wiki_gid", 0)
    note = _note(id=42, title="读书笔记：深度学习", content="正文")
    r = publish_note(note)
    assert r["slug"] == "读书笔记-深度学习"
    assert r["overwritten"] is False
    f = tmp_path / "读书笔记-深度学习.md"
    assert f.exists()
    assert "# 读书笔记：深度学习" in f.read_text(encoding="utf-8")


def test_publish_overwrites_existing(tmp_path, monkeypatch):
    """再次发布同一篇 → overwritten=True，内容更新"""
    monkeypatch.setattr(settings, "wiki_entries_path", str(tmp_path))
    monkeypatch.setattr(settings, "wiki_uid", 0)
    monkeypatch.setattr(settings, "wiki_gid", 0)
    note = _note(id=1, title="同标题", content="旧")
    assert publish_note(note)["overwritten"] is False
    note.content = "新正文"
    r = publish_note(note)
    assert r["overwritten"] is True
    assert "新正文" in (tmp_path / "同标题.md").read_text(encoding="utf-8")
