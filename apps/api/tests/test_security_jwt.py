from app.auth import security, jwt as jwt_utils


def test_password_hash_and_verify():
    h = security.hash_password("secret123")
    assert h != "secret123"
    assert security.verify_password("secret123", h) is True
    assert security.verify_password("wrong", h) is False


def test_access_and_refresh_tokens_roundtrip():
    access = jwt_utils.create_access_token(42)
    refresh = jwt_utils.create_refresh_token(42)
    a_payload = jwt_utils.decode_token(access)
    r_payload = jwt_utils.decode_token(refresh)
    assert a_payload["sub"] == "42" and a_payload["type"] == "access"
    assert r_payload["sub"] == "42" and r_payload["type"] == "refresh"
