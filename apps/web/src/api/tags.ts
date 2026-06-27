import api from "./client";
import type { Tag } from "../types";

export async function listTags(): Promise<Tag[]> {
  const { data } = await api.get<Tag[]>("/api/tags/");
  return data;
}

export async function createTag(name: string): Promise<Tag> {
  const { data } = await api.post<Tag>("/api/tags/", { name });
  return data;
}

export async function deleteTag(id: number): Promise<void> {
  await api.delete(`/api/tags/${id}`);
}
