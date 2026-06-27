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

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
