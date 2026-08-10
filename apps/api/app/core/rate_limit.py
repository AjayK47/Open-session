"""Fixed-window rate limiting (§26: "Rate-limit account/email-code endpoints").

DB-backed (via RateLimitBucket) rather than in-process, so the limit holds even if
the API runs as multiple worker processes. This is also the practical stand-in for
Turnstile on public endpoints until real site keys are wired in: it won't stop a
single sophisticated bot, but it caps brute-force/spam volume from any one client.
"""

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db, utcnow
from app.core.security import new_id
from app.models.auth import RateLimitBucket

DEVICE_COOKIE_NAME = "osdid"
DEVICE_COOKIE_MAX_AGE = 365 * 24 * 3600


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def client_device_id(request: Request, response: Response) -> str:
    """An opaque per-browser id, issued on first use and read back afterward.

    Purely a rate-limit bucketing key — not a security token, not tied to any
    account, and never checked against anything server-side beyond "have we
    seen this cookie before". Clearing cookies resets it, which is fine: the
    device dimension only exists to stop one browser from consuming a shared
    IP's whole allowance, not to identify or authenticate anyone.
    """
    existing = request.cookies.get(DEVICE_COOKIE_NAME)
    if existing:
        return existing
    device_id = new_id()
    response.set_cookie(
        key=DEVICE_COOKIE_NAME,
        value=device_id,
        max_age=DEVICE_COOKIE_MAX_AGE,
        httponly=True,
        secure=settings.environment != "development",
        samesite="lax",
        path="/",
    )
    return device_id


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


def ip_device_rate_limit(name: str, *, ip_limit: int, device_limit: int, window_seconds: int):
    """FastAPI dependency: throttle per client IP, with a tighter per-device
    sub-limit inside that pool (see client_device_id).

    A single busy browser is capped at `device_limit`; the whole IP — everyone
    behind one office NAT, say — shares the larger `ip_limit`. Either one alone
    can trip the 429.
    """

    def dependency(request: Request, response: Response, db: Session = Depends(get_db)) -> None:
        ip = client_ip(request)
        device_id = client_device_id(request, response)
        device_key = f"{name}:ip:{ip}:device:{device_id[:16]}"
        check_rate_limit(db, f"{name}:ip:{ip}", limit=ip_limit, window_seconds=window_seconds)
        check_rate_limit(db, device_key, limit=device_limit, window_seconds=window_seconds)

    return dependency
