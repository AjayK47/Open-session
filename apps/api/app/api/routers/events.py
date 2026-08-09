from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import (
    get_current_user,
    get_principal,
    get_repos,
    require_event_access,
    require_event_role,
)
from app.core.db import get_db
from app.models.auth import User
from app.repositories import Repositories
from app.schemas.events import EventCreateRequest, EventRead, EventUpdate
from app.services import event_service

router = APIRouter(prefix="/api/v1/events", tags=["events"])


@router.get("", response_model=list[EventRead])
def list_events(
    principal=Depends(get_principal),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> list:
    if principal.kind == "apikey":
        key = principal.api_key
        event = repos.events.get(key.event_id) if key and key.event_id else None
        return [event] if event else []
    return event_service.list_user_events(db, repos, principal.user.id)


@router.post("", response_model=EventRead, status_code=201)
def create_event(
    body: EventCreateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    try:
        return event_service.create_event(db, repos, user.id, body)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/{event_id}", response_model=EventRead)
def get_event(
    event_id: str = Depends(require_event_access),
    repos: Repositories = Depends(get_repos),
):
    event = event_service.get_event(repos, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.patch("/{event_id}", response_model=EventRead)
def update_event(
    body: EventUpdate,
    event_id: str = Depends(require_event_role("owner", "admin")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    event = event_service.update_event(db, repos, user.id, event_id, body)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return event
