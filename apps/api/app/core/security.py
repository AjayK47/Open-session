import hashlib
import hmac
import secrets
import uuid

from itsdangerous import BadSignature, URLSafeTimedSerializer

from app.core.config import settings


def new_id() -> str:
    return uuid.uuid4().hex


def new_code(length: int = 6) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))


_serializer = URLSafeTimedSerializer(settings.session_secret, salt="open-session-session")


def sign_session(session_id: str) -> str:
    return _serializer.dumps(session_id)


def verify_session(token: str, max_age: int | None = None) -> str | None:
    try:
        return _serializer.loads(token, max_age=max_age or settings.session_max_age_seconds)
    except BadSignature:
        return None


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)
