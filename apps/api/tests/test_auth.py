def test_register_returns_tokens(client):
    r = client.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["user"]["username"] == "alice"


def test_register_duplicate_username_conflict(client):
    client.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
    r = client.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
    assert r.status_code == 409


def test_login_success_and_me(client):
    client.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
    r = client.post("/api/auth/login", json={"username": "alice", "password": "secret123"})
    assert r.status_code == 200
    token = r.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "alice"


def test_login_wrong_password(client):
    client.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
    r = client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
    assert r.status_code == 401


def test_refresh_issues_new_access_token(client):
    r = client.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
    refresh = r.json()["refresh_token"]
    r2 = client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert r2.status_code == 200
    assert r2.json()["access_token"]


def test_me_without_token_unauthorized(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401
