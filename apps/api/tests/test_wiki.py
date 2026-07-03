# Wiki 发布：服务层（slug/渲染/写文件）与路由测试
from app.services.wiki_publish_service import make_slug


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
