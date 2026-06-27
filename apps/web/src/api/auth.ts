import api from "./client";
import type { TokenPair, User } from "../types";

export async function register(username: string, password: string): Promise<TokenPair> {
  const { data } = await api.post<TokenPair>("/api/auth/register", { username, password });
  return data;
}

export async function login(username: string, password: string): Promise<TokenPair> {
  const { data } = await api.post<TokenPair>("/api/auth/login", { username, password });
  return data;
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<User>("/api/auth/me");
  return data;
}
