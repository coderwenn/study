# 测试辅助：注册并登录，返回 access_token


def register_and_login(client, username: str = "alice", password: str = "secret123") -> str:
    """注册新用户并登录，返回 access_token"""
    client.post("/api/auth/register", json={"username": username, "password": password})
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    return r.json()["access_token"]
