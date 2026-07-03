# FastAPI 应用入口
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.database import init_db
from app.routers import auth as auth_router
from app.routers import notes as notes_router
from app.routers import tags as tags_router
from app.routers import wiki as wiki_router
import app.models  # noqa: F401  注册所有模型


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时建表（开发用）
    init_db()
    yield


app = FastAPI(title="笔记网站 API", version="0.1.0", lifespan=lifespan)

# 挂载鉴权路由（注册/登录/刷新/me）
app.include_router(auth_router.router)

# 挂载笔记路由（CRUD + 保护防删 + 用户隔离）
app.include_router(notes_router.router)

# 挂载标签路由（增删查 + 计数 + 用户隔离）
app.include_router(tags_router.router)

# 挂载 wiki 发布路由（把笔记发布为 Wiki Source）
app.include_router(wiki_router.router)


@app.get("/api/health")
def health() -> dict:
    """健康检查端点"""
    return {"status": "ok"}
