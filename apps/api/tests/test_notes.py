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
    """未保护笔记可删除，删除后 404"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    nid = client.post("/api/notes/", json={"title": "X"}, headers=h).json()["id"]
    r = client.delete(f"/api/notes/{nid}", headers=h)
    assert r.status_code == 204
    assert client.get(f"/api/notes/{nid}", headers=h).status_code == 404


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
