"""Fixed-window rate limiting (§26: "Rate-limit account/email-code endpoints").

DB-backed (via RateLimitBucket) rather than in-process, so the limit holds even if
the API runs as multiple worker processes. This is also the practical stand-in for
Turnstile on public endpoints until real site keys are wired in: it won't stop a
single sophisticated bot, but it caps brute-force/spam volume from any one client.
"""

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db, utcnow
from app.models.auth import RateLimitBucket


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_rate_limit(db: Session, key: str, *, limit: int, window_seconds: int) -> None:
    """Raise 429 if `key` has been hit more than `limit` times in the current window."""
    if not settings.rate_limit_enabled:
        return

    now = utcnow()
    bucket = db.get(RateLimitBucket, key)
    if bucket is None:
        bucket = RateLimitBucket(key=key, window_start=now, count=0)
        db.add(bucket)
    elif (now - bucket.window_start).total_seconds() >= window_seconds:
        bucket.window_start = now
        bucket.count = 0

    if bucket.count >= limit:
        retry_after = max(1, int(window_seconds - (now - bucket.window_start).total_seconds()))
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    bucket.count += 1
    db.commit()


def ip_rate_limit(name: str, limit: int, window_seconds: int):
    """FastAPI dependency: throttle a route per client IP."""

    def dependency(request: Request, db: Session = Depends(get_db)) -> None:
        check_rate_limit(db, f"{name}:ip:{client_ip(request)}", limit=limit, window_seconds=window_seconds)

    return dependency
