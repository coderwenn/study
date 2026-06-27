# 标签相关 Pydantic 模型
from pydantic import BaseModel, Field


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)


class TagOut(BaseModel):
    id: int
    name: str
    note_count: int = 0

    model_config = {"from_attributes": True}
