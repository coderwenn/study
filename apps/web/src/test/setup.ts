import "@testing-library/jest-dom";

// localStorage 桩（jsdom 已自带，这里确保清空）
beforeEach(() => {
  localStorage.clear();
});
