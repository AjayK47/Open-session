"""Unit tests for the DB-backed rate limiter (§26).

Settings is a process-wide singleton (app.core.config.settings) constructed once
from whichever test module the runner imports first, so flipping
OPEN_SESSION_RATE_LIMIT_ENABLED via os.environ here would have no effect on it.
Instead we toggle the already-constructed settings object directly and restore it
afterwards. This also means we deliberately reuse the shared test engine/session
rather than standing up a separate sqlite file: RateLimitBucket keys below are
namespaced with a unique prefix, so they can't collide with other suites' data.
"""

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.core.db import Base, SessionLocal, engine
from app.core.rate_limit import check_rate_limit
from app.models.auth import RateLimitBucket

Base.metadata.create_all(bind=engine)


@pytest.fixture()
def db():
    previous = settings.rate_limit_enabled
    settings.rate_limit_enabled = True
    session = SessionLocal()
    try:
        yield session
    finally:
        session.query(RateLimitBucket).filter(RateLimitBucket.key.like("unit:%")).delete(
            synchronize_session=False
        )
        session.commit()
        session.close()
        settings.rate_limit_enabled = previous


def test_allows_requests_under_the_limit(db):
    for _ in range(3):
        check_rate_limit(db, "unit:under", limit=3, window_seconds=60)


def test_blocks_once_the_limit_is_exceeded(db):
    for _ in range(3):
        check_rate_limit(db, "unit:over", limit=3, window_seconds=60)
    with pytest.raises(HTTPException) as exc:
        check_rate_limit(db, "unit:over", limit=3, window_seconds=60)
    assert exc.value.status_code == 429
    assert "Retry-After" in exc.value.headers


def test_separate_keys_have_independent_buckets(db):
    for _ in range(3):
        check_rate_limit(db, "unit:key-a", limit=3, window_seconds=60)
    # a different key (e.g. a different IP or email) is unaffected
    check_rate_limit(db, "unit:key-b", limit=3, window_seconds=60)


def test_window_resets_after_expiry(db):
    for _ in range(3):
        check_rate_limit(db, "unit:expiring", limit=3, window_seconds=60)
    with pytest.raises(HTTPException):
        check_rate_limit(db, "unit:expiring", limit=3, window_seconds=60)

    # simulate the window having elapsed
    from datetime import timedelta

    from app.core.db import utcnow

    bucket = db.get(RateLimitBucket, "unit:expiring")
    bucket.window_start = utcnow() - timedelta(seconds=61)
    db.commit()

    check_rate_limit(db, "unit:expiring", limit=3, window_seconds=60)


def test_disabled_setting_skips_enforcement(db):
    settings.rate_limit_enabled = False
    for _ in range(10):
        check_rate_limit(db, "unit:disabled", limit=1, window_seconds=60)
