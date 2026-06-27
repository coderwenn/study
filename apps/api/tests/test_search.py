from tests.helpers import register_and_login


def test_search_matches_title_and_content(client):
    token = register_and_login(client)
    h = {"Authorization": f"Bearer {token}"}
    client.post("/api/notes/", json={"title": "学习 FastAPI", "content": "路由很重要"}, headers=h)
    client.post("/api/notes/", json={"title": "无关笔记", "content": "今天天气不错"}, headers=h)

    r1 = client.get("/api/notes/", params={"q": "FastAPI"}, headers=h)
    assert r1.status_code == 200
    assert len(r1.json()) == 1
    assert r1.json()[0]["title"] == "学习 FastAPI"

    r2 = client.get("/api/notes/", params={"q": "路由"}, headers=h)
    assert len(r2.json()) == 1


def test_search_isolated_by_user(client):
    a = register_and_login(client, "alice", "secret123")
    b = register_and_login(client, "bob", "secret123")
    client.post(
        "/api/notes/",
        json={"title": "AliceOnly", "content": "秘密"},
        headers={"Authorization": f"Bearer {a}"},
    )
    # bob 搜不到 alice 的内容
    r = client.get("/api/notes/", params={"q": "AliceOnly"}, headers={"Authorization": f"Bearer {b}"})
    assert r.json() == []
