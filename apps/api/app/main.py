# FastAPI 应用入口
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.database import init_db
import app.models  # noqa: F401  注册所有模型


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时建表（开发用）
    init_db()
    yield


app = FastAPI(title="笔记网站 API", version="0.1.0", lifespan=lifespan)


@app.get("/api/health")
def health() -> dict:
    """健康检查端点"""
    return {"status": "ok"}
