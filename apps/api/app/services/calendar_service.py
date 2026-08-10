"""Optional one-way speaker calendar synchronization through Composio."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any, Literal
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import utcnow
from app.core.outbound_http import request_json
from app.models.auth import User
from app.models.calendar import CalendarConnection, CalendarEventLink
from app.repositories import Repositories

CalendarProvider = Literal["google", "microsoft"]

PROVIDER_CONFIG = {
    "google": {
        "toolkit": "googlecalendar",
        "version": "20260721_00",
        "create": "GOOGLECALENDAR_CREATE_EVENT",
        "update": "GOOGLECALENDAR_PATCH_EVENT",
        "delete": "GOOGLECALENDAR_DELETE_EVENT",
    },
    "microsoft": {
        "toolkit": "outlook",
        "version": "20260724_00",
        "create": "OUTLOOK_CALENDAR_CREATE_EVENT",
        "update": "OUTLOOK_UPDATE_CALENDAR_EVENT",
        "delete": "OUTLOOK_DELETE_CALENDAR_EVENT",
    },
}


def is_available() -> bool:
    return bool(settings.composio_api_key)


class _HttpSession:
    def __init__(self, client: ComposioHttpClient, session_id: str):
        self.client = client
        self.session_id = session_id

    def authorize(self, toolkit: str, callback_url: str):
        data = self.client._request(
            "POST",
            f"/tool_router/session/{self.session_id}/link",
            {"toolkit": toolkit, "callback_url": callback_url},
        )
        return SimpleNamespace(
            redirect_url=data.get("redirect_url"),
            connected_account_id=data.get("connected_account_id"),
        )


class _HttpSessions:
    def __init__(self, client: ComposioHttpClient):
        self.client = client

    def create(self, *, user_id: str, toolkits: list[str], manage_connections: bool):
        data = self.client._request(
            "POST",
            "/tool_router/session",
            {
                "user_id": user_id,
                "toolkits": {"enabled": toolkits},
                "manage_connections": {"enable": manage_connections},
            },
        )
        return _HttpSession(self.client, data["session_id"])


class _HttpConnectedAccounts:
    def __init__(self, client: ComposioHttpClient):
        self.client = client

    def get(self, connected_account_id: str):
        return self.client._request("GET", f"/connected_accounts/{connected_account_id}")

    def delete(self, connected_account_id: str, *, revoke_on_delete: bool):
        if revoke_on_delete:
            self.client._request("POST", f"/connected_accounts/{connected_account_id}/revoke", {})
        return self.client._request("DELETE", f"/connected_accounts/{connected_account_id}")


class _HttpTools:
    def __init__(self, client: ComposioHttpClient):
        self.client = client

    def execute(
        self,
        slug: str,
        arguments: dict,
        *,
        user_id: str,
        connected_account_id: str,
        version: str,
    ):
        return self.client._request(
            "POST",
            f"/tools/execute/{slug}",
            {
                "arguments": arguments,
                "user_id": user_id,
                "connected_account_id": connected_account_id,
                "version": version,
            },
        )


class ComposioHttpClient:
    """Small REST client covering only the calendar operations Open Session uses."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.sessions = _HttpSessions(self)
        self.connected_accounts = _HttpConnectedAccounts(self)
        self.tools = _HttpTools(self)

    def _request(self, method: str, path: str, body: dict | None = None) -> dict[str, Any]:
        return request_json(
            method,
            f"https://backend.composio.dev/api/v3.1{path}",
            headers={"x-api-key": self.api_key},
            body=body,
        )


def _client() -> ComposioHttpClient:
    if not is_available():
        raise HTTPException(status_code=503, detail="Connected calendar synchronization is not configured.")
    return ComposioHttpClient(api_key=settings.composio_api_key)


def _provider(provider: CalendarProvider) -> dict[str, str]:
    return PROVIDER_CONFIG[provider]


def _validate_return_path(return_path: str) -> None:
    if not return_path.startswith("/portal/") or return_path.startswith("//"):
        raise HTTPException(status_code=400, detail="Calendar connections must return to the speaker portal.")


def start_connection(user: User, provider: CalendarProvider, return_path: str) -> dict[str, str]:
    _validate_return_path(return_path)
    config = _provider(provider)
    callback_query = urlencode({"calendar_provider": provider})
    callback_url = f"{settings.web_app_url.rstrip('/')}{return_path}?{callback_query}"
    try:
        composio_session = _client().sessions.create(
            user_id=user.id,
            toolkits=[config["toolkit"]],
            manage_connections=False,
        )
        request = composio_session.authorize(config["toolkit"], callback_url=callback_url)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Composio could not start the calendar connection.") from exc
    return {"authorization_url": request.redirect_url}


def _value(value: Any, name: str, default: Any = None) -> Any:
    if isinstance(value, dict):
        return value.get(name, default)
    return getattr(value, name, default)


def _find_email(value: Any) -> str | None:
    if hasattr(value, "model_dump"):
        value = value.model_dump()
    if isinstance(value, dict):
        for key in ("email", "email_address", "emailAddress", "mail", "userPrincipalName"):
            candidate = value.get(key)
            if isinstance(candidate, str) and "@" in candidate:
                return candidate
        for nested in value.values():
            found = _find_email(nested)
            if found:
                return found
    elif isinstance(value, list):
        for nested in value:
            found = _find_email(nested)
            if found:
                return found
    return None


def complete_connection(
    db: Session,
    user: User,
    provider: CalendarProvider,
    connected_account_id: str,
) -> CalendarConnection:
    config = _provider(provider)
    try:
        account = _client().connected_accounts.get(connected_account_id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Composio could not verify the connected account.") from exc

    toolkit = _value(_value(account, "toolkit"), "slug")
    if _value(account, "user_id") != user.id or toolkit != config["toolkit"]:
        raise HTTPException(status_code=403, detail="That calendar connection does not belong to this user.")
    if str(_value(account, "status", "")).upper() != "ACTIVE":
        raise HTTPException(status_code=409, detail="Calendar authorization is not complete.")

    connection = db.scalar(
        select(CalendarConnection).where(
            CalendarConnection.user_id == user.id,
            CalendarConnection.provider == provider,
        )
    )
    previous_account_id = connection.composio_connected_account_id if connection else None
    if connection is None:
        connection = CalendarConnection(
            user_id=user.id,
            provider=provider,
            composio_connected_account_id=connected_account_id,
        )
        db.add(connection)
    connection.composio_connected_account_id = connected_account_id
    connection.provider_account_email = _find_email(
        {
            "data": _value(account, "data", {}),
            "params": _value(account, "params", {}),
            "state": _value(account, "state", {}),
        }
    )
    connection.status = "active"
    connection.last_error = None
    db.commit()
    db.refresh(connection)

    if previous_account_id and previous_account_id != connected_account_id:
        try:
            _client().connected_accounts.delete(previous_account_id, revoke_on_delete=True)
        except Exception:
            pass
    return connection


def _connection_view(db: Session, connection: CalendarConnection) -> dict[str, Any]:
    links = list(db.scalars(select(CalendarEventLink).where(CalendarEventLink.connection_id == connection.id)))
    return {
        "id": connection.id,
        "provider": connection.provider,
        "provider_account_email": connection.provider_account_email,
        "status": connection.status,
        "last_error": connection.last_error,
        "last_synced_at": connection.last_synced_at,
        "synced_events": sum(1 for link in links if link.sync_status == "synced"),
        "failed_events": sum(1 for link in links if link.sync_status == "failed"),
        "created_at": connection.created_at,
    }


def list_connections(db: Session, user_id: str) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(CalendarConnection)
        .where(CalendarConnection.user_id == user_id)
        .order_by(CalendarConnection.provider.asc())
    )
    return [_connection_view(db, row) for row in rows]


def _session_content(repos: Repositories, session) -> dict[str, Any]:
    event = repos.events.get(session.event_id)
    room = repos.rooms.get(session.room_id) if session.room_id else None
    people = []
    for participant in repos.session_participants.list_for_session(session.id):
        person = repos.people.get(participant.person_id)
        if person:
            people.append(" ".join(filter(None, [person.first_name, person.last_name])) or person.primary_email)
    description = _strip_html(session.description or "")
    if people:
        description += f"\n\nSpeakers: {', '.join(people)}"
    description += f"\n\nSpeaker portal: {settings.web_app_url.rstrip('/')}/portal/{event.slug}"
    description += f"\nOpen Session session ID: {session.id}"
    timezone = event.timezone or "UTC"
    start = session.starts_at.astimezone(ZoneInfo(timezone))
    end = session.ends_at.astimezone(ZoneInfo(timezone))
    return {
        "title": session.title,
        "description": description.strip(),
        "location": room.name if room else session.location or "",
        "timezone": timezone,
        "start": start,
        "end": end,
    }


def _strip_html(value: str) -> str:
    import re

    return re.sub(r"<[^>]+>", " ", value).strip()


def _arguments(provider: CalendarProvider, action: str, content: dict[str, Any], event_id: str | None) -> dict:
    if action == "delete":
        if provider == "google":
            return {"calendar_id": "primary", "event_id": event_id, "send_updates": "none"}
        return {"user_id": "me", "event_id": event_id}
    start = content["start"]
    end = content["end"]
    local_start = start.replace(tzinfo=None).isoformat(timespec="seconds")
    local_end = end.replace(tzinfo=None).isoformat(timespec="seconds")
    if provider == "google":
        if action == "update":
            return {
                "calendar_id": "primary",
                "event_id": event_id,
                "summary": content["title"],
                "description": content["description"],
                "location": content["location"],
                "start_time": start.isoformat(timespec="seconds"),
                "end_time": end.isoformat(timespec="seconds"),
                "timezone": content["timezone"],
                "send_updates": "none",
            }
        return {
            "calendar_id": "primary",
            "summary": content["title"],
            "description": content["description"],
            "location": content["location"],
            "start_datetime": local_start,
            "end_datetime": local_end,
            "timezone": content["timezone"],
            "send_updates": "none",
            "exclude_organizer": True,
            "create_meeting_room": False,
            "extended_properties": {"private": {"open_session_id": content.get("session_id", "")}},
        }
    if action == "update":
        return {
            "user_id": "me",
            "event_id": event_id,
            "subject": content["title"],
            "body": {"contentType": "Text", "content": content["description"]},
            "location": content["location"],
            "start_datetime": local_start,
            "end_datetime": local_end,
            "time_zone": content["timezone"],
            "show_as": "busy",
        }
    return {
        "user_id": "me",
        "subject": content["title"],
        "body": content["description"],
        "is_html": False,
        "location": content["location"],
        "start_datetime": local_start,
        "end_datetime": local_end,
        "time_zone": content["timezone"],
        "show_as": "busy",
    }


def _execute(connection: CalendarConnection, action: str, arguments: dict) -> Any:
    config = _provider(connection.provider)  # type: ignore[arg-type]
    result = _client().tools.execute(
        config[action],
        arguments,
        user_id=connection.user_id,
        connected_account_id=connection.composio_connected_account_id,
        version=config["version"],
    )
    if not _value(result, "successful", False):
        raise RuntimeError(_value(result, "error") or f"Composio {action} failed")
    return _value(result, "data", {})


def _extract_event_id(value: Any) -> str | None:
    if isinstance(value, str):
        try:
            return _extract_event_id(json.loads(value))
        except (json.JSONDecodeError, TypeError):
            return None
    if hasattr(value, "model_dump"):
        value = value.model_dump()
    if isinstance(value, dict):
        for key in ("id", "event_id", "eventId"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
        for key in ("response_data", "response", "data"):
            found = _extract_event_id(value.get(key))
            if found:
                return found
    return None


def _sync_one(db: Session, repos: Repositories, connection: CalendarConnection, session, person_id: str) -> None:
    link = db.scalar(
        select(CalendarEventLink).where(
            CalendarEventLink.connection_id == connection.id,
            CalendarEventLink.session_id == session.id,
        )
    )
    if link is None:
        link = CalendarEventLink(connection_id=connection.id, session_id=session.id, speaker_person_id=person_id)
        db.add(link)
        db.flush()

    try:
        is_live = session.starts_at is not None and session.ends_at is not None and session.status != "cancelled"
        if not is_live:
            if link.provider_event_id:
                _execute(
                    connection,
                    "delete",
                    _arguments(connection.provider, "delete", {}, link.provider_event_id),  # type: ignore[arg-type]
                )
            link.sync_status = "cancelled"
        else:
            content = _session_content(repos, session)
            content["session_id"] = session.id
            action = "update" if link.provider_event_id else "create"
            data = _execute(
                connection,
                action,
                _arguments(connection.provider, action, content, link.provider_event_id),  # type: ignore[arg-type]
            )
            if action == "create":
                link.provider_event_id = _extract_event_id(data)
                if not link.provider_event_id:
                    raise RuntimeError("Composio created the event but did not return its event ID.")
            link.sync_status = "synced"
        link.last_error = None
        link.last_synced_at = utcnow()
        connection.status = "active"
        connection.last_error = None
        connection.last_synced_at = utcnow()
    except Exception as exc:
        link.sync_status = "failed"
        link.last_error = str(exc)[:4000]
        connection.status = "error"
        connection.last_error = str(exc)[:4000]
    db.commit()


def sync_connection(db: Session, repos: Repositories, connection: CalendarConnection, person_id: str) -> dict[str, Any]:
    for participant in repos.session_participants.list_for_person(person_id):
        session = repos.sessions.get(participant.session_id)
        if session:
            _sync_one(db, repos, connection, session, person_id)
    db.refresh(connection)
    return _connection_view(db, connection)


def sync_session_connections(db: Session, repos: Repositories, session) -> None:
    for participant in repos.session_participants.list_for_session(session.id):
        user = db.scalar(select(User).where(User.person_id == participant.person_id))
        if user is None:
            continue
        connections = list(
            db.scalars(
                select(CalendarConnection).where(
                    CalendarConnection.user_id == user.id,
                    CalendarConnection.status.in_(("active", "error")),
                )
            )
        )
        for connection in connections:
            _sync_one(db, repos, connection, session, participant.person_id)


def disconnect(db: Session, user_id: str, connection_id: str) -> None:
    connection = db.get(CalendarConnection, connection_id)
    if connection is None or connection.user_id != user_id:
        raise HTTPException(status_code=404, detail="Calendar connection not found")
    if is_available():
        try:
            _client().connected_accounts.delete(connection.composio_connected_account_id, revoke_on_delete=True)
        except Exception:
            # Local disconnect must remain available if Composio is temporarily
            # unreachable; the user can also revoke the grant at the provider.
            pass
    db.execute(delete(CalendarEventLink).where(CalendarEventLink.connection_id == connection.id))
    db.delete(connection)
    db.commit()
