from typing import Literal
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_repos
from app.core.config import settings
from app.core.db import get_db
from app.models.auth import User
from app.models.calendar import CalendarConnection
from app.repositories import Repositories
from app.services import calendar_service

router = APIRouter(prefix="/api/v1/calendar", tags=["calendar"])


class OAuthStartRequest(BaseModel):
    return_path: str = Field(min_length=1, max_length=500)


@router.get("/connections")
def list_connections(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return calendar_service.list_connections(db, user.id)


@router.post("/oauth/{provider}/start")
def start_oauth(
    body: OAuthStartRequest,
    provider: Literal["google", "microsoft"],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return calendar_service.start_oauth(db, user, provider, body.return_path)


@router.get("/oauth/{provider}/callback")
def oauth_callback(
    provider: Literal["google", "microsoft"],
    state: str = Query(min_length=16),
    code: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    if error or not code:
        target = f"{settings.web_app_url.rstrip('/')}/login?{urlencode({'calendar_error': error or 'access_denied'})}"
        return RedirectResponse(target, status_code=302)
    _, return_path = calendar_service.complete_oauth(db, provider, state, code)
    target = f"{settings.web_app_url.rstrip('/')}{return_path}?calendar=connected&provider={provider}"
    return RedirectResponse(target, status_code=302)


@router.post("/connections/{connection_id}/sync")
def sync_connection(
    connection_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    connection = db.get(CalendarConnection, connection_id)
    if connection is None or connection.user_id != user.id:
        raise HTTPException(status_code=404, detail="Calendar connection not found")
    if not user.person_id:
        raise HTTPException(status_code=400, detail="No speaker profile is linked to this account")
    return calendar_service.sync_connection(db, repos, connection, user.person_id)


@router.delete("/connections/{connection_id}", status_code=204)
def disconnect(
    connection_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    calendar_service.disconnect(db, user.id, connection_id)
