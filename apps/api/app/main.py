# FastAPI 应用入口
from fastapi import FastAPI

app = FastAPI(title="笔记网站 API", version="0.1.0")


@app.get("/api/health")
def health() -> dict:
    """健康检查端点，供前端/运维探活"""
    return {"status": "ok"}
