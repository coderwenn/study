# 笔记相关 Pydantic 模型
from datetime import datetime
from pydantic import BaseModel, Field


class TagRef(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class NoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = ""
    is_protected: bool = False
    tag_ids: list[int] = Field(default_factory=list)


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = None
    is_protected: bool | None = None
    tag_ids: list[int] | None = None


class NoteOut(BaseModel):
    id: int
    title: str
    content: str
    is_protected: bool
    created_at: datetime
    updated_at: datetime
    tags: list[TagRef] = []

    model_config = {"from_attributes": True}


class NoteListItem(BaseModel):
    """列表项：不含正文，仅摘要，减少传输"""
    id: int
    title: str
    snippet: str
    is_protected: bool
    updated_at: datetime
    tags: list[TagRef] = []

    model_config = {"from_attributes": True}
