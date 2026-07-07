# 网页总结的请求/草稿模型
from pydantic import BaseModel, Field


class SummarizeRequest(BaseModel):
    # 用 str + 服务端 validate_url 校验，便于给出中文 400；空串由 Pydantic 422 兜住
    url: str = Field(min_length=1)


class SummarizeDraft(BaseModel):
    url: str
    title: str
    summary: str
    suggested_tags: list[str] = []
