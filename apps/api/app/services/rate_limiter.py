# 内存级 per-user 滑动窗口限流（网页总结用）
# 注意：多 worker 部署下每个 worker 各自计数 → 近似（个人项目够用）
import time
from collections import defaultdict, deque


class RateLimiter:
    """简单的 per-key 滑动窗口限流器。

    allow(key, now)：窗口内未超 max_calls 则记一次并返回 True，否则 False。
    now 可注入以便测试（默认 time.monotonic()）。"""

    def __init__(self, max_calls: int, window_seconds: float):
        self.max_calls = max_calls
        self.window = window_seconds
        # 每个 key 维护一个命中时间戳的双端队列
        self._hits: dict[str, deque] = defaultdict(deque)

    def allow(self, key: str, now: float | None = None) -> bool:
        t = now if now is not None else time.monotonic()
        dq = self._hits[key]
        # 清掉窗口外的旧命中
        cutoff = t - self.window
        while dq and dq[0] <= cutoff:
            dq.popleft()
        if len(dq) >= self.max_calls:
            return False
        dq.append(t)
        return True
