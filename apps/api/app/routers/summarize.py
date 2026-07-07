# 网页总结路由：agent 抓取+总结一条链接，返回草稿（不落库）
# 503 未配置 / 429 限流 / 400 URL 非法 / 422 无草稿 / 504 触顶 / 502 LLM 故障 / 200 成功
from fastapi import APIRouter, Depends, HTTPException

from app.auth.deps import get_current_user
from app.config import settings
from app.models.user import User
from app.schemas.summarize import SummarizeDraft, SummarizeRequest
from app.services import summarize_service as svc
from app.services.rate_limiter import RateLimiter

router = APIRouter(prefix="/api", tags=["summarize"])

# per-user 内存限流器（多 worker 下各自计数，近似）
_limiter = RateLimiter(settings.summarize_rate_limit, settings.summarize_rate_window_seconds)


@router.post("/summarize", response_model=SummarizeDraft)
def summarize(payload: SummarizeRequest, user: User = Depends(get_current_user)):
    """总结一条链接，返回草稿（不落库）。详见 ADR-001/002。"""
    # 1) 功能开关：LLM_* 三件任一未配置 → 503
    if not (settings.llm_base_url and settings.llm_api_key and settings.llm_model):
        raise HTTPException(503, "网页总结未配置（需设置 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL）")
    # 2) per-user 限流 → 429
    if not _limiter.allow(user.username):
        raise HTTPException(429, "请求过于频繁，请稍后再试")
    # 3) 入口 URL 预校验 → 400（给用户清晰错误，不进 agent）
    try:
        svc.validate_url(payload.url)
    except ValueError as e:
        raise HTTPException(400, str(e))
    # 4) 跑 agent
    try:
        return svc.summarize_url(payload.url)
    except svc.SummarizeError as e:
        # 触顶/超时 → 504；其余（no_draft 等）→ 422
        code = 504 if e.kind in ("timeout", "max_iters") else 422
        raise HTTPException(code, str(e))
    except svc.LLMError as e:
        # 端点故障 → 502（unconfigured 理论上已被开关拦下，留作保险）
        raise HTTPException(502, str(e))
