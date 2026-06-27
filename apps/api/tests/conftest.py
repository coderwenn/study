import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture()
def client():
    """每个测试用例独立的 TestClient"""
    return TestClient(app)
