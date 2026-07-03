# 发布笔记到 LLM Wiki — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在笔记应用里加一个「发布到 Wiki」按钮，把当前笔记物化成带轻量溯源 frontmatter 的 `.md`，作为「来源」写进服务器上 Hermes llm-wiki 的 `entries/` 目录（无状态、按标题 slug 覆盖、仅 owner 可发）。

**Architecture:** 后端 FastAPI 新增 `POST /api/notes/{id}/wiki`：复用现有鉴权与用户隔离，加 owner 守卫与「未配置→503」守卫；新增 `wiki_publish_service` 负责 slug / 渲染 frontmatter / 原子写文件 / `os.chown`。部署通过 bind mount 把宿主机 `entries/` 挂进 `api` 容器（见 ADR-001）。前端在 `NoteEditor` 顶栏「导出」旁加「发布到 Wiki」按钮 + 内联状态提示（与现有 `exportMd` 同为本地函数，无缓存副作用）。详见 `docs/superpowers/specs/2026-07-03-publish-to-wiki-adr-001.md` 与 `CONTEXT.md`。

**Tech Stack:** 后端 FastAPI · SQLAlchemy · pydantic-settings（仅标准库 `os`/`re`/`pathlib`，**无新依赖**）；前端 React 18 · TypeScript · TanStack Query · axios · `lucide-react`；测试 pytest+httpx / vitest。

**约定：**
- 后端测试：`cd apps/api && uv run pytest tests/test_wiki.py -v`（全量 `cd apps/api && uv run pytest`）。测试用 `monkeypatch.setattr(settings, ...)` 注入临时配置，用 `tmp_path` 作 entries 目录。
- 前端测试：`pnpm --filter web test -- --run src/test/wiki.test.ts`（全量 `pnpm --filter web test -- --run`）；构建 `pnpm --filter web build`。
- 提交信息沿用仓库 conventional commits 风格（中文描述）。
- `NoteEditor` 是编排组件，其改动沿用本仓库既有先例（编辑器工具栏计划 Task 12 的 ⌘S）——**手动验证**而非单测；逻辑（slug / 渲染 / 写文件 / 路由）走完整 TDD。
- frontmatter 里凡字符串字段一律用 `_yaml_str` 双引号转义，规避标题含冒号/引号导致的 YAML 解析歧义。

---

## 文件结构

| 文件 | 职责 | 动作 |
| --- | --- | --- |
| `apps/api/app/services/wiki_publish_service.py` | `make_slug` / `render_wiki_source` / `publish_note`（写文件） | 新建 |
| `apps/api/app/routers/wiki.py` | `POST /api/notes/{id}/wiki`：503 / owner 403 / 隔离 404 / 写文件 | 新建 |
| `apps/api/app/config.py` | 4 个 wiki 配置字段 | 修改 |
| `apps/api/app/main.py` | 注册 wiki 路由 | 修改 |
| `apps/api/tests/test_wiki.py` | 服务 + 路由测试 | 新建 |
| `apps/web/src/api/wiki.ts` | `publishNoteToWiki(id)` axios 封装 | 新建 |
| `apps/web/src/test/wiki.test.ts` | api 封装契约测试 | 新建 |
| `apps/web/src/components/NoteEditor.tsx` | 「发布到 Wiki」按钮 + 状态提示 | 修改 |
| `docker-compose.yml` | bind mount `entries/` + 4 个 env | 修改 |
| `.env.example` / `apps/api/.env.example` | wiki env 示例 | 修改 |
| `docs/deploy.md` | wiki 发布部署说明 | 修改 |

---

## Task 1：make_slug — 标题转文件名 slug（纯函数）

**Files:**
- Create: `apps/api/app/services/wiki_publish_service.py`
- Test: `apps/api/tests/test_wiki.py`

- [ ] **Step 1: 写失败测试（slug 规则）**

创建 `apps/api/tests/test_wiki.py`：

```python
# Wiki 发布：服务层（slug/渲染/写文件）与路由测试
import re
from types import SimpleNamespace
from datetime import datetime

from app.services.wiki_publish_service import make_slug


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


def test_make_slug_strip_illegal():
    """文件系统非法字符被替换掉"""
    assert make_slug("a/b\\c*d?e", 1) == "abcde"


def test_make_slug_empty_fallback_note_id():
    """全非法/空标题 → 回退 note-{id}"""
    assert make_slug("？？？", 1) == "note-1"
    assert make_slug("   ", 2) == "note-2"
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd apps/api && uv run pytest tests/test_wiki.py -v`
Expected: FAIL（`ModuleNotFoundError: app.services.wiki_publish_service`）。

- [ ] **Step 3: 实现 make_slug**

创建 `apps/api/app/services/wiki_publish_service.py`：

```python
# 把笔记物化为 Wiki Source 文件，写进 llm-wiki 的 entries/ 目录
# 详见 docs/superpowers/specs/2026-07-03-publish-to-wiki-adr-001.md
import os
import re
from pathlib import Path

from app.config import settings

# 文件名 / 同步不友好的字符：文件系统硬非法 + 全角标点 + 控制字符
# 替换为空格后折叠成 -（例：全角冒号 → -），而不是直接删（更可读）
_ILLEGAL_RE = re.compile(r'[:：*？""<>|/\\\x00-\x1f]')
# 任意空白（含全角空格 　）折叠为单个 -
_WS_RE = re.compile(r'[\s　]+')


def make_slug(title: str, note_id: int) -> str:
    """标题 → 文件名 slug：保留中文，非法字符替换为空格再折叠为 -，
    拉丁字母小写；结果为空则回退 note-{id}。"""
    s = (title or "").strip()
    # 非法字符替换成空格（便于后续折叠成 -）
    s = _ILLEGAL_RE.sub(" ", s)
    # 空白折叠为单个 -，并去掉首尾 -
    s = _WS_RE.sub("-", s).strip("-")
    # 拉丁字母小写（CJK 无影响）
    s = s.lower()
    return s or f"note-{note_id}"
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd apps/api && uv run pytest tests/test_wiki.py -v`
Expected: PASS（4 条）。

- [ ] **Step 5: 提交**

```bash
git add apps/api/app/services/wiki_publish_service.py apps/api/tests/test_wiki.py
git commit -m "feat(api): wiki 发布 make_slug(中文+清洗)"
```

---

## Task 2：render_wiki_source — frontmatter + H1 + 原文

**Files:**
- Modify: `apps/api/app/services/wiki_publish_service.py`
- Test: `apps/api/tests/test_wiki.py`

- [ ] **Step 1: 写失败测试（渲染内容 + YAML 转义）**

在 `tests/test_wiki.py` 顶部追加导入：

```python
from app.services.wiki_publish_service import render_wiki_source
```

追加测试：

```python
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd apps/api && uv run pytest tests/test_wiki.py -v`
Expected: FAIL（`render_wiki_source` 未定义）。

- [ ] **Step 3: 实现 render_wiki_source + _yaml_str**

在 `wiki_publish_service.py` 的 `make_slug` 之后追加：

```python
def _yaml_str(s: str) -> str:
    """转成双引号 YAML 标量：转义反斜杠与双引号，规避冒号 / 引号导致的解析歧义"""
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def render_wiki_source(note) -> str:
    """把笔记渲染成 Wiki Source 的完整 .md：轻量溯源 frontmatter + H1 + 原文"""
    created = note.created_at.date().isoformat()
    updated = note.updated_at.date().isoformat()
    # 标签作为 YAML inline list（每个名字都转义）
    if note.tags:
        tags = ", ".join(_yaml_str(t.name) for t in note.tags)
    else:
        tags = ""
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
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd apps/api && uv run pytest tests/test_wiki.py -v`
Expected: PASS（7 条）。

- [ ] **Step 5: 提交**

```bash
git add apps/api/app/services/wiki_publish_service.py apps/api/tests/test_wiki.py
git commit -m "feat(api): wiki 发布 render_wiki_source(溯源 frontmatter)"
```

---

## Task 3：publish_note — 原子写文件 + 覆盖 + chmod/chown

**Files:**
- Modify: `apps/api/app/services/wiki_publish_service.py`
- Test: `apps/api/tests/test_wiki.py`

- [ ] **Step 1: 写失败测试（写文件 + 覆盖检测）**

在 `tests/test_wiki.py` 顶部追加导入：

```python
from app.config import settings
from app.services.wiki_publish_service import publish_note
```

追加测试（用 `tmp_path` + monkeypatch 注入配置；默认 uid/gid=0 不 chown，测试不依赖 root）：

```python
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd apps/api && uv run pytest tests/test_wiki.py -v`
Expected: FAIL（`publish_note` 未定义）。

- [ ] **Step 3: 实现 publish_note**

在 `wiki_publish_service.py` 末尾追加：

```python
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
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd apps/api && uv run pytest tests/test_wiki.py -v`
Expected: PASS（9 条）。

- [ ] **Step 5: 提交**

```bash
git add apps/api/app/services/wiki_publish_service.py apps/api/tests/test_wiki.py
git commit -m "feat(api): wiki 发布 publish_note(原子写+覆盖+chown)"
```

---

## Task 4：config 字段 + 路由 + 注册（503 / owner 403 / 隔离 404 / 200）

**Files:**
- Modify: `apps/api/app/config.py`
- Create: `apps/api/app/routers/wiki.py`
- Modify: `apps/api/app/main.py`
- Test: `apps/api/tests/test_wiki.py`

- [ ] **Step 1: 写失败测试（路由层：未配置/owner/隔离/成功）**

在 `tests/test_wiki.py` 顶部追加导入：

```python
from tests.helpers import register_and_login
```

追加测试：

```python
def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _make_note(client, token, title="待发布", content="正文"):
    return client.post(
        "/api/notes/", json={"title": title, "content": content}, headers=_h(token)
    ).json()["id"]


def test_publish_503_when_not_configured(client):
    """默认未配置 → 503"""
    token = register_and_login(client)
    nid = _make_note(client, token)
    r = client.post(f"/api/notes/{nid}/wiki", headers=_h(token))
    assert r.status_code == 503


def test_publish_owner_only(client, monkeypatch, tmp_path):
    """仅 WIKI_OWNER 用户可发布；其他用户 403"""
    monkeypatch.setattr(settings, "wiki_entries_path", str(tmp_path))
    monkeypatch.setattr(settings, "wiki_owner", "alice")
    alice = register_and_login(client, "alice", "secret123")
    bob = register_and_login(client, "bob", "secret123")
    nid = _make_note(client, alice)
    assert client.post(f"/api/notes/{nid}/wiki", headers=_h(alice)).status_code == 200
    assert client.post(f"/api/notes/{nid}/wiki", headers=_h(bob)).status_code == 403


def test_publish_user_isolation_404(client, monkeypatch, tmp_path):
    """owner 也不能发布别人的笔记 → 404"""
    monkeypatch.setattr(settings, "wiki_entries_path", str(tmp_path))
    monkeypatch.setattr(settings, "wiki_owner", "alice")
    alice = register_and_login(client, "alice", "secret123")
    bob = register_and_login(client, "bob", "secret123")
    bob_note = _make_note(client, bob, title="bob的")
    # alice 是 owner，但该笔记不属于她 → 404（不泄漏存在性）
    r = client.post(f"/api/notes/{bob_note}/wiki", headers=_h(alice))
    assert r.status_code == 404


def test_publish_success_writes_file(client, monkeypatch, tmp_path):
    """owner 发布自己的笔记 → 200 且文件落地，frontmatter 含溯源"""
    monkeypatch.setattr(settings, "wiki_entries_path", str(tmp_path))
    monkeypatch.setattr(settings, "wiki_owner", "alice")
    monkeypatch.setattr(settings, "wiki_uid", 0)
    monkeypatch.setattr(settings, "wiki_gid", 0)
    alice = register_and_login(client, "alice", "secret123")
    nid = _make_note(client, alice, title="读书笔记：深度学习", content="正文")
    r = client.post(f"/api/notes/{nid}/wiki", headers=_h(alice))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["slug"] == "读书笔记-深度学习"
    assert body["overwritten"] is False
    f = tmp_path / "读书笔记-深度学习.md"
    assert f.exists()
    assert "source: notes-app" in f.read_text(encoding="utf-8")
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd apps/api && uv run pytest tests/test_wiki.py -v`
Expected: FAIL（路由不存在 → 404/405，且 `settings` 无 `wiki_owner` 等字段）。

- [ ] **Step 3: 给 config 加 4 个字段**

修改 `apps/api/app/config.py`，在 `Settings` 类内（`refresh_token_expire_days` 之后、`model_config` 之前）追加：

```python
    # —— Wiki 发布：把笔记作为来源写进 Hermes llm-wiki 的 entries/ 目录 ——
    # 容器内 entries/ 绝对路径；为空则功能关闭（端点返回 503）
    wiki_entries_path: str = ""
    # 允许发布的用户名（owner）；为空则功能关闭
    wiki_owner: str = ""
    # 写完文件后 chown 的宿主机 uid/gid；0 表示不 chown（见 ADR-001）
    wiki_uid: int = 0
    wiki_gid: int = 0
```

- [ ] **Step 4: 实现路由 `routers/wiki.py`**

创建 `apps/api/app/routers/wiki.py`：

```python
# Wiki 发布路由：把笔记作为「来源」写进 llm-wiki 的 entries/
# 仅 owner 可发；未配置（WIKI_ENTRIES_PATH/WIKI_OWNER 为空）返回 503
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.services import note_service, wiki_publish_service

router = APIRouter(prefix="/api/notes", tags=["wiki"])


@router.post("/{note_id}/wiki")
def publish_note_to_wiki(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """把笔记发布为 Wiki Source（仅 owner；未配置返回 503；越权返回 404）"""
    # 1) 功能开关：path 或 owner 任一未配置 → 503
    if not settings.wiki_entries_path or not settings.wiki_owner:
        raise HTTPException(
            status_code=503, detail="Wiki 未配置（需设置 WIKI_ENTRIES_PATH 与 WIKI_OWNER）"
        )
    # 2) 仅 owner 可发布
    if user.username != settings.wiki_owner:
        raise HTTPException(status_code=403, detail="仅 Wiki owner 可发布")
    # 3) 取笔记（强制 user_id 隔离；不存在或不属于该用户 → 404）
    note = note_service.get_note(db, user.id, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="笔记不存在")
    # 4) 写文件
    try:
        return wiki_publish_service.publish_note(note)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"写入 Wiki 失败：{e}")
```

- [ ] **Step 5: 注册路由**

修改 `apps/api/app/main.py`，在 `tags_router` 注册之后追加（并加 import）：

```python
from app.routers import wiki as wiki_router
```
（与现有 `auth/notes/tags` 的 import 放在一起）

```python
# 挂载 wiki 发布路由（把笔记发布为 Wiki Source）
app.include_router(wiki_router.router)
```

- [ ] **Step 6: 运行测试，确认通过**

Run: `cd apps/api && uv run pytest tests/test_wiki.py -v`
Expected: PASS（13 条）。再跑全量确认无回归：`cd apps/api && uv run pytest`。

- [ ] **Step 7: 提交**

```bash
git add apps/api/app/config.py apps/api/app/routers/wiki.py apps/api/app/main.py apps/api/tests/test_wiki.py
git commit -m "feat(api): POST /notes/{id}/wiki 发布笔记到 wiki(503/owner/隔离)"
```

---

## Task 5：前端 `api/wiki.ts`（axios 封装 + 契约测试）

**Files:**
- Create: `apps/web/src/api/wiki.ts`
- Test: `apps/web/src/test/wiki.test.ts`

- [ ] **Step 1: 写失败测试（POST 到正确 URL 并回传结果）**

创建 `apps/web/src/test/wiki.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// 把 axios 实例桩掉：只关心 publishNoteToWiki 调对 URL、透传返回值
vi.mock("../api/client", () => ({
  __esModule: true,
  default: { post: vi.fn() },
}));

import api from "../api/client";
import { publishNoteToWiki } from "../api/wiki";

describe("publishNoteToWiki", () => {
  beforeEach(() => {
    (api.post as any).mockReset();
  });

  it("POST /api/notes/:id/wiki 并返回 path/slug/overwritten", async () => {
    (api.post as any).mockResolvedValue({
      data: { path: "/wiki/entries/x.md", slug: "x", overwritten: false },
    });
    const r = await publishNoteToWiki(5);
    expect(api.post).toHaveBeenCalledWith("/api/notes/5/wiki");
    expect(r).toEqual({ path: "/wiki/entries/x.md", slug: "x", overwritten: false });
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm --filter web test -- --run src/test/wiki.test.ts`
Expected: FAIL（`../api/wiki` 不存在）。

- [ ] **Step 3: 实现 api/wiki.ts**

创建 `apps/web/src/api/wiki.ts`：

```ts
import api from "./client";

// 发布到 Wiki 的返回：服务端 publish_note 的结果
export interface PublishResult {
  path: string;
  slug: string;
  overwritten: boolean;
}

// 把笔记发布为 Wiki Source（服务端写进 entries/；仅 owner，否则 403/503）
export async function publishNoteToWiki(noteId: number): Promise<PublishResult> {
  const { data } = await api.post<PublishResult>(`/api/notes/${noteId}/wiki`);
  return data;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter web test -- --run src/test/wiki.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/api/wiki.ts apps/web/src/test/wiki.test.ts
git commit -m "feat(web): publishNoteToWiki api 封装"
```

---

## Task 6：前端 `NoteEditor` 接入「发布到 Wiki」按钮 + 状态提示

**Files:**
- Modify: `apps/web/src/components/NoteEditor.tsx`

> 承编辑器工具栏计划 Task 12（⌘S）先例：`NoteEditor` 是编排组件，本任务**手动验证**，不加单测。发布与已有 `exportMd` 一样是本地 async 函数（无服务端缓存副作用，无需走 TanStack mutation）。

- [ ] **Step 1: 加 import 与状态**

修改 `apps/web/src/components/NoteEditor.tsx`：

把第 4 行 import 改为（增加 `Send` 图标）：

```tsx
import { Download, Lock, NotebookPen, Send } from "lucide-react";
```

并在文件顶部 import 区加：

```tsx
import { publishNoteToWiki } from "../api/wiki";
```

在组件内现有 `useState` 群附近（`protected_` 之后）加：

```tsx
  // 发布到 Wiki 的瞬时状态：null=无提示 / publishing=发布中 / ok|err=结果（4s 自动清空）
  const [wikiMsg, setWikiMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [publishing, setPublishing] = useState(false);
```

- [ ] **Step 2: 加发布处理函数**

在 `exportMd` 函数附近新增：

```tsx
  // 发布到 Wiki：把当前笔记写进服务器 entries/（仅 owner；失败显示后端 detail）
  async function publishToWiki() {
    if (!note) return;
    setPublishing(true);
    setWikiMsg(null);
    try {
      const r = await publishNoteToWiki(note.id);
      setWikiMsg({
        kind: "ok",
        text: r.overwritten ? `已更新：${r.slug}.md` : `已发布：${r.slug}.md`,
      });
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setWikiMsg({ kind: "err", text: typeof detail === "string" ? detail : "发布失败" });
    } finally {
      setPublishing(false);
      // 4s 后自动清空提示，避免长期占用顶栏
      setTimeout(() => setWikiMsg(null), 4000);
    }
  }
```

- [ ] **Step 3: 在顶栏加按钮 + 状态提示**

在 header 的 `<div className="flex items-center gap-3 shrink-0">` 内，**「导出」按钮之前**插入「发布到 Wiki」按钮与状态提示：

```tsx
          <button
            onClick={publishToWiki}
            disabled={publishing}
            title="发布到 Wiki（写进服务器 entries/）"
            className="flex items-center gap-1 px-3 py-1.5 border border-outline-variant rounded-md text-sm font-medium text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-60"
          >
            <Send className="w-[18px] h-[18px]" />
            <span>{publishing ? "发布中…" : "发布到 Wiki"}</span>
          </button>
          {wikiMsg && (
            <span
              className={`text-xs ${
                wikiMsg.kind === "ok" ? "text-primary" : "text-red-600"
              }`}
            >
              {wikiMsg.text}
            </span>
          )}
```

- [ ] **Step 4: 手动验证**

Run: `pnpm dev`（根目录，同时起前后端）。
- 本地默认未配置 `WIKI_*` → 点「发布到 Wiki」→ 顶栏出现红色 `Wiki 未配置…`（503）。✅
- 临时配置后端 env（在 `apps/api/.env` 设 `WIKI_ENTRIES_PATH=/tmp/wiki-test`、`WIKI_OWNER=<你的用户名>`，重启后端）→ 登录该用户 → 新建笔记「读书笔记：深度学习」→ 点发布 → 绿色 `已发布：读书笔记-深度学习.md`；检查 `/tmp/wiki-test/读书笔记-深度学习.md` 内容含 frontmatter。再点一次 → `已更新：…`。✅
- 验证后清掉临时 env，停止 dev。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/components/NoteEditor.tsx
git commit -m "feat(web): NoteEditor 顶栏「发布到 Wiki」按钮+状态提示"
```

---

## Task 7：部署配置（compose bind mount + env 示例 + deploy 文档）

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `apps/api/.env.example`
- Modify: `docs/deploy.md`

> 无单测（基础设施）。改动后用 `docker compose config` 校验语法。

- [ ] **Step 1: compose 加 bind mount + env**

修改 `docker-compose.yml` 的 `api` 服务：在 `volumes` 列表追加一行（只挂 entries 子目录，最小权限）：

```yaml
    volumes:
      # 数据库持久化卷（删/重建容器数据不丢）
      - notes-data:/data
      # Hermes llm-wiki 的来源目录（宿主机 ↔ 容器；见 ADR-001）
      - /home/ubuntu/wiki/entries:/wiki/entries
```

在 `api` 的 `environment` 列表末尾（`REFRESH_TOKEN_EXPIRE_DAYS` 之后）追加：

```yaml
      # —— 发布到 Wiki ——
      WIKI_ENTRIES_PATH: /wiki/entries
      WIKI_OWNER: ${WIKI_OWNER:-}
      WIKI_UID: ${WIKI_UID:-0}
      WIKI_GID: ${WIKI_GID:-0}
```

- [ ] **Step 2: 根 .env.example 补 wiki 占位**

修改根目录 `.env.example`，在末尾追加：

```bash

# 发布到 Wiki（可选；不填则功能关闭，端点返回 503）
# WIKI_OWNER：允许发布的用户名（笔记应用里的登录名）
WIKI_OWNER=
# 宿主机 wiki 目录属主的 uid/gid（通常 ubuntu=1000:1000）；不填则不 chown
WIKI_UID=1000
WIKI_GID=1000
```

- [ ] **Step 3: api .env.example 补字段（本地开发）**

修改 `apps/api/.env.example`，在末尾追加：

```bash

# 发布到 Wiki（本地开发用；留空则功能关闭）
WIKI_ENTRIES_PATH=
WIKI_OWNER=
WIKI_UID=0
WIKI_GID=0
```

- [ ] **Step 4: deploy.md 加一小节**

修改 `docs/deploy.md`，在第 9 节「常用运维命令」之前插入新小节：

```markdown
## 8.5 发布笔记到 LLM Wiki（可选）

若服务器上部署了 Hermes 的 llm-wiki，可把笔记一键发布为 wiki「来源」：

1. 确保宿主机目录存在且属主正确（Hermes 以该用户读写）：
   ```bash
   mkdir -p /home/ubuntu/wiki/entries
   id -u ubuntu   # 记下 uid（通常 1000）
   ```
2. 在根 `.env` 填：
   ```bash
   WIKI_OWNER=你的笔记应用登录名
   WIKI_UID=1000
   WIKI_GID=1000
   ```
   （`WIKI_ENTRIES_PATH` 由 compose 固定为容器内 `/wiki/entries`，宿主机固定挂 `/home/ubuntu/wiki/entries`，无需改。）
3. `docker compose up -d --build api` 重建后端。
4. 以 `WIKI_OWNER` 用户登录笔记应用，打开任意笔记点「发布到 Wiki」，应提示 `已发布：xxx.md`。

> 发布是「来源投递」：只写 `entries/`，不动 `index.md`/`log.md`/`SCHEMA.md`；交叉引用与综合成页交给 Hermes。详见 ADR-001。
```

- [ ] **Step 5: 校验 compose 语法**

Run: `docker compose config >/dev/null && echo OK`
Expected: 打印 `OK`（无 YAML / 变量错误）。

- [ ] **Step 6: 提交**

```bash
git add docker-compose.yml .env.example apps/api/.env.example docs/deploy.md
git commit -m "feat(deploy): 发布到 wiki 的 bind mount + env + 文档"
```

---

## Task 8：全量测试 + 类型检查 + 构建 + 端到端回归

**Files:** 无新增；运行全部测试与回归。

- [ ] **Step 1: 后端全量测试**

Run: `cd apps/api && uv run pytest`
Expected: 全绿（含新增 `tests/test_wiki.py` 13 条 + 原有用例）。

- [ ] **Step 2: 前端全量测试**

Run: `pnpm --filter web test -- --run`
Expected: 全绿（含新增 `src/test/wiki.test.ts`）。

- [ ] **Step 3: 前端类型检查 + 构建**

Run: `pnpm --filter web build`
Expected: `tsc -b` 与 `vite build` 均无错。

- [ ] **Step 4: 端到端回归（手动，需服务器或本地配齐 env）**

逐项验证：

| 验证项 | 期望 |
| --- | --- |
| 未配置 `WIKI_*` 时点「发布到 Wiki」 | 顶栏红色 `Wiki 未配置…`（503） |
| 非 owner 用户点发布 | 顶栏红色 `仅 Wiki owner 可发布`（403） |
| owner 发布「读书笔记：深度学习」 | 绿色 `已发布：读书笔记-深度学习.md`；文件落地、含 frontmatter |
| 改正文后再点发布 | 绿色 `已更新：…`，文件内容刷新 |
| 标题含 ASCII 冒号（如 `a: b`） | frontmatter 里 `title: "a: b"`（双引号转义） |
| 文件属主（生产） | `ls -l entries/*.md` 属主为 ubuntu（uid=1000），Hermes 可读可改 |

- [ ] **Step 5: 提交（若回归中发现并修复了小问题）**

如本步无代码改动则跳过；否则：

```bash
git add -A
git commit -m "fix: 发布到 wiki 回归修复"
```

---

## 自审（Self-Review）

**1. Spec 覆盖（对照设计规格 7 项决策 + 内容/配置/测试）：**
- 角色=来源投递（frontmatter 溯源、不写 index/log）→ Task 2 frontmatter + Task 4 路由只写 entries。✓
- 语义=无状态·按标题 slug 覆盖、不加字段 → Task 1 slug + Task 3 `overwritten` 覆盖；无 Note 表改动。✓
- 通道=bind mount entries/ + chown → Task 7 compose + Task 3 chown + ADR-001。✓
- 内容=轻量溯源 frontmatter + H1 + 原文 → Task 2（含 `_yaml_str` 转义）。✓
- 文件名=保留中文+清洗 → Task 1。✓
- 权限=仅 owner → Task 4 owner 403 + 503 未配置。✓
- 触发=编辑器顶栏单篇按钮 + toast → Task 6。✓
- 图片非问题（无上传后端，URL 原样保留）→ 无需任务，符合 YAGNI。✓
- 测试覆盖 → Tasks 1–5 各含测试；Task 6 手动验证（承先例）；Task 8 全量回归。✓

**2. 占位符扫描：** 无 TBD/TODO；每个代码步均含完整可运行代码；Task 6/7 的「手动验证」是有意为之（承 Task 12 先例 + 基础设施），非占位。✓

**3. 类型/契约一致性：**
- 后端 `publish_note` 返回 `{path, slug, overwritten}`（Task 3）↔ 路由直接 `return`（Task 4）↔ 前端 `PublishResult` 同三字段（Task 5）。✓
- `make_slug` 签名 `(title, note_id)` 在 Task 1 定义、Task 3 调用一致。✓
- 配置字段 `wiki_entries_path/wiki_owner/wiki_uid/wiki_gid`（Task 4 config）↔ service 读 `settings.wiki_*`（Task 3）↔ compose env `WIKI_*`（Task 7）↔ 测试 monkeypatch 同名（Tasks 3/4）。✓
- 路由路径 `POST /api/notes/{id}/wiki` ↔ 前端 `api.post("/api/notes/${id}/wiki")`（Task 5）↔ 契约测试断言（Task 5）。✓
