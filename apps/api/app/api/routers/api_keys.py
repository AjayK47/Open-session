from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_api_key_role, require_event_role
from app.core.db import get_db
from app.core.security import hash_secret
from app.models.auth import ApiKey
from app.schemas.ops import ApiKeyCreate, ApiKeyCreated, ApiKeyRead

router = APIRouter(prefix="/api/v1", tags=["api keys"])


def _now() -> datetime:
    return datetime.now(UTC)


@router.get("/events/{event_id}/api-keys", response_model=list[ApiKeyRead])
def list_keys(
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
) -> list:
    keys = db.scalars(select(ApiKey).where(ApiKey.event_id == event_id).order_by(ApiKey.created_at.desc())).all()
    return keys


@router.post("/events/{event_id}/api-keys", response_model=ApiKeyCreated, status_code=201)
def create_key(
    body: ApiKeyCreate,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
) -> ApiKeyCreated:
    import secrets

    plaintext = f"os_{secrets.token_urlsafe(32)}"
    key = ApiKey(
        event_id=event_id,
        name=body.name,
        key_hash=hash_secret(plaintext),
        scopes=body.scopes or [],
        expires_at=body.expires_at,
    )
    db.add(key)
    db.commit()
    return ApiKeyCreated(id=key.id, name=key.name, scopes=key.scopes, key=plaintext)


@router.delete("/api-keys/{key_id}")
def delete_key(
    key_id: str = Depends(require_api_key_role("owner", "admin")),
    db: Session = Depends(get_db),
):
    key = db.get(ApiKey, key_id)
    if key is None:
        raise HTTPException(status_code=404, detail="API key not found")
    db.delete(key)
    db.commit()
    return {"ok": True}


@router.get("/keys/validate")
def validate_key(request: Request, db: Session = Depends(get_db)) -> dict:
    authorization = request.headers.get("Authorization")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer API key required.")
    token = authorization.split(" ", 1)[1].strip()
    key = db.scalar(select(ApiKey).where(ApiKey.key_hash == hash_secret(token)))
    if key is None or (key.expires_at and key.expires_at < _now()):
        raise HTTPException(status_code=401, detail="Invalid API key")
    return {"event_id": key.event_id, "name": key.name, "scopes": key.scopes}
