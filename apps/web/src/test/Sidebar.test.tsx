// 侧边栏隐藏空标签：note_count===0 的标签不渲染；选中标签变空/被删时自动回退到「全部」
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import Sidebar from "../components/Sidebar";
import type { Tag } from "../types";

// 用 vi.hoisted 建立可变状态：mock 工厂读取该引用，每个用例直接改 state.tags 即可
const state = vi.hoisted(() => ({
  tags: [] as Tag[],
  user: { username: "alice" },
}));

vi.mock("../hooks/useTags", () => ({
  useTags: () => ({ data: state.tags }),
}));
vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: state.user, logout: () => {} }),
}));

const TAGS: Tag[] = [
  { id: 1, name: "工作", note_count: 3 },
  { id: 2, name: "空标签", note_count: 0 },
  { id: 3, name: "生活", note_count: 1 },
];

describe("Sidebar 隐藏空标签", () => {
  it("note_count===0 的标签不渲染，note_count>0 的渲染", () => {
    state.tags = TAGS;
    const { getByText, queryByText } = render(
      <Sidebar selectedTagId={null} onSelectTag={() => {}} onCreate={() => {}} />
    );
    expect(getByText("工作")).toBeInTheDocument();
    expect(getByText("生活")).toBeInTheDocument();
    expect(queryByText("空标签")).toBeNull();
  });
});
