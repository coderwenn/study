// 侧边栏隐藏空标签：note_count===0 的标签不渲染；选中标签变空/被删时自动回退到「全部」
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
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

  it("选中的标签变为 note_count===0 时，调用 onSelectTag(null) 回到「全部」", async () => {
    state.tags = TAGS; // id:1 工作(3) 可见，id:2 空(0)，id:3 生活(1)
    const onSelectTag = vi.fn();
    const { rerender } = render(
      <Sidebar selectedTagId={1} onSelectTag={onSelectTag} onCreate={() => {}} />
    );
    // 初始「工作」可见，不应触发回退
    expect(onSelectTag).not.toHaveBeenCalled();

    // 模拟「工作」从唯一一篇笔记上被移除 -> note_count 变 0 -> 被过滤掉
    state.tags = [
      { id: 1, name: "工作", note_count: 0 },
      { id: 2, name: "空标签", note_count: 0 },
      { id: 3, name: "生活", note_count: 1 },
    ];
    rerender(
      <Sidebar selectedTagId={1} onSelectTag={onSelectTag} onCreate={() => {}} />
    );
    await waitFor(() => expect(onSelectTag).toHaveBeenCalledWith(null));
  });

  it("选中的标签可见时，不调用 onSelectTag", () => {
    state.tags = TAGS;
    const onSelectTag = vi.fn();
    render(
      <Sidebar selectedTagId={1} onSelectTag={onSelectTag} onCreate={() => {}} />
    );
    expect(onSelectTag).not.toHaveBeenCalled();
  });
});
