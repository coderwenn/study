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
  created_at: string;
  updated_at: string;
  tags: TagRef[];
}

export interface NoteListItem {
  id: number;
  title: string;
  snippet: string;
  is_protected: boolean;
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
