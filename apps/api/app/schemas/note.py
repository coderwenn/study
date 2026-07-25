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
    """笔记部分更新；任何字段缺省都视为不更新该字段"""
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = None
    is_protected: bool | None = None
    # 置顶状态：True 置顶 / False 取消置顶 / None 不变更
    is_pinned: bool | None = None
    tag_ids: list[int] | None = None


class NoteOut(BaseModel):
    """笔记详情：返回完整字段，含置顶与软删除状态"""
    id: int
    title: str
    content: str
    is_protected: bool
    is_deleted: bool
    is_pinned: bool
    pinned_at: datetime | None = None
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
    is_pinned: bool
    pinned_at: datetime | None = None
    updated_at: datetime
    tags: list[TagRef] = []

    model_config = {"from_attributes": True}


class TrashListItem(BaseModel):
    """废纸篓列表项：在普通列表项基础上额外携带删除时间"""
    id: int
    title: str
    snippet: str
    is_protected: bool
    deleted_at: datetime | None = None
    updated_at: datetime
    tags: list[TagRef] = []

    model_config = {"from_attributes": True}
