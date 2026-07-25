// 与后端 Pydantic schema 一一对应的类型

export interface User {
  id: number;
  username: string;
  email: string | null;
  created_at: string;
}

export interface TagRef {
  id: number;
  name: string;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  is_protected: boolean;
  is_deleted: boolean;
  is_pinned: boolean;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
  tags: TagRef[];
}

export interface NoteListItem {
  id: number;
  title: string;
  snippet: string;
  is_protected: boolean;
  is_pinned: boolean;
  pinned_at: string | null;
  updated_at: string;
  tags: TagRef[];
}

// 废纸篓列表项：含删除时间，不含置顶字段
export interface TrashListItem {
  id: number;
  title: string;
  snippet: string;
  is_protected: boolean;
  deleted_at: string | null;
  updated_at: string;
  tags: TagRef[];
}

export interface Tag {
  id: number;
  name: string;
  note_count: number;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user?: User;
}
