# 笔记 CRUD / 保护 / 隔离 测试
from tests.helpers import register_and_login


def test_create_and_get_note(client):
    """创建笔记后能用 id 取回"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    r = client.post("/api/notes/", json={"title": "第一条", "content": "你好世界"}, headers=h)
    assert r.status_code == 200, r.text
    nid = r.json()["id"]
    g = client.get(f"/api/notes/{nid}", headers=h)
    assert g.status_code == 200
    assert g.json()["title"] == "第一条"


def test_list_notes_returns_snippet(client):
    """列表项返回摘要而非完整正文"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    client.post("/api/notes/", json={"title": "A", "content": "正文内容"}, headers=h)
    r = client.get("/api/notes/", headers=h)
    assert r.status_code == 200
    item = r.json()[0]
    assert item["title"] == "A"
    assert "正文内容" in item["snippet"]
    assert "content" not in item  # 列表项不含完整正文


def test_update_note(client):
    """PUT 部分更新标题"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    nid = client.post("/api/notes/", json={"title": "旧", "content": ""}, headers=h).json()["id"]
    r = client.put(f"/api/notes/{nid}", json={"title": "新标题"}, headers=h)
    assert r.status_code == 200
    assert r.json()["title"] == "新标题"


def test_delete_unprotected_note(client):
    """未保护笔记软删除后从正常列表消失，但详情仍可访问（带 is_deleted=True）"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    nid = client.post("/api/notes/", json={"title": "X"}, headers=h).json()["id"]
    r = client.delete(f"/api/notes/{nid}", headers=h)
    assert r.status_code == 204
    # 软删除后详情仍可访问，标记为已删除
    g = client.get(f"/api/notes/{nid}", headers=h)
    assert g.status_code == 200
    assert g.json()["is_deleted"] is True
    # 但不在正常列表中
    titles = [n["title"] for n in client.get("/api/notes/", headers=h).json()]
    assert "X" not in titles


def test_delete_protected_note_forbidden(client):
    """受保护笔记删除返回 403；解除保护后可删"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    nid = client.post(
        "/api/notes/", json={"title": "锁定", "is_protected": True}, headers=h
    ).json()["id"]
    r = client.delete(f"/api/notes/{nid}", headers=h)
    assert r.status_code == 403
    # 解除保护后可删
    client.put(f"/api/notes/{nid}", json={"is_protected": False}, headers=h)
    assert client.delete(f"/api/notes/{nid}", headers=h).status_code == 204


def test_user_isolation(client):
    """不同用户之间笔记互相隔离"""
    a = register_and_login(client, "alice", "secret123")
    b = register_and_login(client, "bob", "secret123")
    nid = client.post(
        "/api/notes/", json={"title": "Alice私"}, headers={"Authorization": f"Bearer {a}"}
    ).json()["id"]
    # bob 看不到 alice 的笔记
    assert client.get(f"/api/notes/{nid}", headers={"Authorization": f"Bearer {b}"}).status_code == 404
    assert client.get("/api/notes/", headers={"Authorization": f"Bearer {b}"}).json() == []


# ---------- 废纸篓（软删除 / 恢复 / 彻底删除） ----------

def test_soft_delete_moves_to_trash(client):
    """删除笔记后从正常列表消失，进入废纸篓列表"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    nid = client.post("/api/notes/", json={"title": "待删", "content": "内容"}, headers=h).json()["id"]

    # 软删除
    assert client.delete(f"/api/notes/{nid}", headers=h).status_code == 204
    # 正常列表不再包含
    titles = [n["title"] for n in client.get("/api/notes/", headers=h).json()]
    assert "待删" not in titles
    # 废纸篓列表包含
    trash = client.get("/api/notes/trash/", headers=h).json()
    assert any(n["id"] == nid for n in trash)
    # 废纸篓项含删除时间
    assert trash[0]["deleted_at"] is not None


def test_soft_delete_protected_forbidden(client):
    """受保护笔记不能软删除（返回 403），需先解除保护"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    nid = client.post(
        "/api/notes/", json={"title": "锁", "is_protected": True}, headers=h
    ).json()["id"]
    assert client.delete(f"/api/notes/{nid}", headers=h).status_code == 403
    # 解除保护后可软删除
    client.put(f"/api/notes/{nid}", json={"is_protected": False}, headers=h)
    assert client.delete(f"/api/notes/{nid}", headers=h).status_code == 204


def test_restore_note(client):
    """从废纸篓恢复笔记后，重新出现在正常列表"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    nid = client.post("/api/notes/", json={"title": "恢复我"}, headers=h).json()["id"]
    client.delete(f"/api/notes/{nid}", headers=h)

    # 恢复
    r = client.post(f"/api/notes/{nid}/restore", headers=h)
    assert r.status_code == 200
    assert r.json()["is_deleted"] is False
    # 正常列表再次出现
    titles = [n["title"] for n in client.get("/api/notes/", headers=h).json()]
    assert "恢复我" in titles
    # 废纸篓列表不再包含
    trash = client.get("/api/notes/trash/", headers=h).json()
    assert not any(n["id"] == nid for n in trash)


def test_purge_note(client):
    """彻底删除笔记：未软删除时拒绝；软删除后彻底删除，详情返回 404"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    nid = client.post("/api/notes/", json={"title": "彻底删"}, headers=h).json()["id"]

    # 未进入废纸篓时禁止彻底删除（403）
    assert client.delete(f"/api/notes/{nid}/purge", headers=h).status_code == 403
    # 先软删除
    client.delete(f"/api/notes/{nid}", headers=h)
    # 彻底删除
    assert client.delete(f"/api/notes/{nid}/purge", headers=h).status_code == 204
    # 详情 404，废纸篓也找不到
    assert client.get(f"/api/notes/{nid}", headers=h).status_code == 404
    trash = client.get("/api/notes/trash/", headers=h).json()
    assert not any(n["id"] == nid for n in trash)


def test_trash_user_isolation(client):
    """废纸篓按用户隔离：bob 看不到 alice 的已删除笔记"""
    a = register_and_login(client, "alice", "secret123")
    b = register_and_login(client, "bob", "secret123")
    nid = client.post(
        "/api/notes/", json={"title": "Alice删"}, headers={"Authorization": f"Bearer {a}"}
    ).json()["id"]
    client.delete(f"/api/notes/{nid}", headers={"Authorization": f"Bearer {a}"})
    # bob 的废纸篓为空
    assert client.get("/api/notes/trash/", headers={"Authorization": f"Bearer {b}"}).json() == []


# ---------- 置顶 ----------

def test_pin_note_appears_first(client):
    """置顶笔记排在列表最前"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    # 创建 3 条笔记（updated_at 递增）
    a = client.post("/api/notes/", json={"title": "A"}, headers=h).json()["id"]
    b = client.post("/api/notes/", json={"title": "B"}, headers=h).json()["id"]
    c = client.post("/api/notes/", json={"title": "C"}, headers=h).json()["id"]

    # 置顶 A（最早创建）
    r = client.post(f"/api/notes/{a}/pin", headers=h)
    assert r.status_code == 200
    assert r.json()["is_pinned"] is True
    assert r.json()["pinned_at"] is not None

    # 列表第一项应为 A（置顶优先）
    items = client.get("/api/notes/", headers=h).json()
    assert items[0]["id"] == a
    assert items[0]["is_pinned"] is True
    # 其余两条非置顶（SQLite now() 精度到秒，同秒创建时不验证相对顺序，仅断言都存在且非置顶）
    rest_ids = {n["id"] for n in items[1:]}
    assert rest_ids == {b, c}
    assert all(not n["is_pinned"] for n in items[1:])


def test_pin_multiple_sorted_by_pinned_at(client):
    """多条置顶笔记按 pinned_at 倒序：后置顶的在前"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    a = client.post("/api/notes/", json={"title": "A"}, headers=h).json()["id"]
    b = client.post("/api/notes/", json={"title": "B"}, headers=h).json()["id"]
    c = client.post("/api/notes/", json={"title": "C"}, headers=h).json()["id"]

    # 先置顶 A，再置顶 B：B 应排在 A 前
    client.post(f"/api/notes/{a}/pin", headers=h)
    client.post(f"/api/notes/{b}/pin", headers=h)

    items = client.get("/api/notes/", headers=h).json()
    pinned = [n["id"] for n in items if n["is_pinned"]]
    assert pinned == [b, a]
    # 未置顶的 C 在最后
    assert items[-1]["id"] == c


def test_unpin_note(client):
    """取消置顶后笔记回到非置顶序列，按 updated_at 排序"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    a = client.post("/api/notes/", json={"title": "A"}, headers=h).json()["id"]
    b = client.post("/api/notes/", json={"title": "B"}, headers=h).json()["id"]
    client.post(f"/api/notes/{a}/pin", headers=h)

    # 取消置顶
    r = client.post(f"/api/notes/{a}/unpin", headers=h)
    assert r.status_code == 200
    assert r.json()["is_pinned"] is False
    assert r.json()["pinned_at"] is None

    items = client.get("/api/notes/", headers=h).json()
    assert not any(n["is_pinned"] for n in items)
    # 取消置顶后两条笔记均在列表中（同秒创建不验证相对顺序）
    assert {n["id"] for n in items} == {a, b}


def test_pin_via_update(client):
    """通过 PUT 接口也能更新置顶状态"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    nid = client.post("/api/notes/", json={"title": "X"}, headers=h).json()["id"]
    r = client.put(f"/api/notes/{nid}", json={"is_pinned": True}, headers=h)
    assert r.status_code == 200
    assert r.json()["is_pinned"] is True
    assert r.json()["pinned_at"] is not None


def test_delete_unpinned_note(client):
    """软删除时同步取消置顶：恢复后笔记不再置顶"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    nid = client.post("/api/notes/", json={"title": "P"}, headers=h).json()["id"]
    client.post(f"/api/notes/{nid}/pin", headers=h)
    # 软删除
    client.delete(f"/api/notes/{nid}", headers=h)
    # 恢复后不置顶
    r = client.post(f"/api/notes/{nid}/restore", headers=h)
    assert r.json()["is_pinned"] is False
    assert r.json()["pinned_at"] is None


def test_search_excludes_trashed(client):
    """搜索不返回废纸篓中的笔记"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    nid = client.post(
        "/api/notes/", json={"title": "搜索关键词", "content": "可被搜到"}, headers=h
    ).json()["id"]
    # 软删除前可搜到
    assert len(client.get("/api/notes/?q=搜索关键词", headers=h).json()) == 1
    client.delete(f"/api/notes/{nid}", headers=h)
    # 软删除后搜不到
    assert client.get("/api/notes/?q=搜索关键词", headers=h).json() == []

