from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_repos
from app.core.db import get_db
from app.models.auth import User
from app.models.calendar import CalendarConnection
from app.repositories import Repositories
from app.services import calendar_service

router = APIRouter(prefix="/api/v1/calendar", tags=["calendar"])

CalendarProvider = Literal["google", "microsoft"]


class ConnectionStartRequest(BaseModel):
    return_path: str = Field(min_length=1, max_length=500)


class ConnectionCompleteRequest(BaseModel):
    connected_account_id: str = Field(min_length=8, max_length=128)


@router.get("/availability")
def availability(user: User = Depends(get_current_user)) -> dict:
    return {
        "enabled": calendar_service.is_available(),
        "providers": ["google", "microsoft"] if calendar_service.is_available() else [],
    }


@router.get("/connections")
def list_connections(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return calendar_service.list_connections(db, user.id)


@router.post("/composio/{provider}/start")
def start_connection(
    body: ConnectionStartRequest,
    provider: CalendarProvider,
    user: User = Depends(get_current_user),
):
    return calendar_service.start_connection(user, provider, body.return_path)


@router.post("/composio/{provider}/complete")
def complete_connection(
    body: ConnectionCompleteRequest,
    provider: CalendarProvider,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    connection = calendar_service.complete_connection(db, user, provider, body.connected_account_id)
    if user.person_id:
        return calendar_service.sync_connection(db, repos, connection, user.person_id)
    return next(item for item in calendar_service.list_connections(db, user.id) if item["id"] == connection.id)


@router.post("/connections/{connection_id}/sync")
def sync_connection(
    connection_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    if not calendar_service.is_available():
        raise HTTPException(status_code=503, detail="Connected calendar synchronization is not configured.")
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
