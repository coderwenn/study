# 标签 CRUD / 计数 / 用户隔离 测试
from tests.helpers import register_and_login


def test_create_and_list_tag_with_count(client):
    """创建标签后列表返回，并统计被笔记引用的次数"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    t = client.post("/api/tags/", json={"name": "FastAPI"}, headers=h)
    assert t.status_code == 200
    tag_id = t.json()["id"]
    # 给一条笔记打上该标签
    client.post("/api/notes/", json={"title": "N", "tag_ids": [tag_id]}, headers=h)
    r = client.get("/api/tags/", headers=h)
    assert r.status_code == 200
    assert r.json() == [{"id": tag_id, "name": "FastAPI", "note_count": 1}]


def test_duplicate_tag_conflict(client):
    """同一用户下重复标签名返回 409"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    client.post("/api/tags/", json={"name": "dup"}, headers=h)
    r = client.post("/api/tags/", json={"name": "dup"}, headers=h)
    assert r.status_code == 409


def test_delete_tag(client):
    """删除标签返回 204，删除后列表为空"""
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    tid = client.post("/api/tags/", json={"name": "x"}, headers=h).json()["id"]
    r = client.delete(f"/api/tags/{tid}", headers=h)
    assert r.status_code == 204
    assert client.get("/api/tags/", headers=h).json() == []


def test_tag_isolation_between_users(client):
    """不同用户之间标签互相隔离，且可创建同名标签"""
    a = register_and_login(client, "alice", "secret123")
    b = register_and_login(client, "bob", "secret123")
    client.post("/api/tags/", json={"name": "mine"}, headers={"Authorization": f"Bearer {a}"})
    # bob 看不到 alice 的标签，可以创建同名
    assert client.get("/api/tags/", headers={"Authorization": f"Bearer {b}"}).json() == []
    assert client.post("/api/tags/", json={"name": "mine"}, headers={"Authorization": f"Bearer {b}"}).status_code == 200
