# 配置项集中管理，敏感值从环境变量读取，带默认值便于本地开发
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # 数据库连接串：默认本地 SQLite 文件
    database_url: str = "sqlite:///./notes.db"
    # JWT 签名密钥（生产环境务必通过环境变量覆盖）
    secret_key: str = "dev-secret-change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # —— Wiki 发布：把笔记作为来源写进 Hermes llm-wiki 的 entries/ 目录 ——
    # 容器内 entries/ 绝对路径；为空则功能关闭（端点返回 503）
    wiki_entries_path: str = ""
    # 允许发布的用户名（owner）；为空则功能关闭
    wiki_owner: str = ""
    # 写完文件后 chown 的宿主机 uid/gid；0 表示不 chown（见 ADR-001）
    wiki_uid: int = 0
    wiki_gid: int = 0

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
