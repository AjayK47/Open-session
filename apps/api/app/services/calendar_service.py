"""Speaker-owned Google Calendar and Microsoft Graph synchronization."""

from __future__ import annotations

import base64
import hashlib
import secrets
from datetime import timedelta
from typing import Any, Literal
from urllib.parse import quote, urlencode
from zoneinfo import ZoneInfo

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import utcnow
from app.models.auth import User
from app.models.calendar import CalendarConnection, CalendarEventLink, CalendarOAuthState
from app.repositories import Repositories

CalendarProvider = Literal["google", "microsoft"]
GOOGLE_SCOPE = "openid email https://www.googleapis.com/auth/calendar.events"
MICROSOFT_SCOPE = "openid email offline_access User.Read Calendars.ReadWrite"


def _http() -> httpx.Client:
    return httpx.Client(timeout=20.0)


def _fernet() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.session_secret.encode()).digest())
    return Fernet(key)


def _encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def _decrypt(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise HTTPException(status_code=503, detail="Stored calendar credentials cannot be decrypted.") from exc


def _provider_config(provider: CalendarProvider) -> tuple[str, str]:
    if provider == "google":
        client_id, client_secret = settings.google_calendar_client_id, settings.google_calendar_client_secret
    else:
        client_id, client_secret = settings.microsoft_calendar_client_id, settings.microsoft_calendar_client_secret
    if not client_id or not client_secret:
        raise HTTPException(status_code=503, detail=f"{provider.title()} Calendar OAuth is not configured.")
    return client_id, client_secret


def _redirect_uri(provider: CalendarProvider) -> str:
    return f"{settings.api_public_url.rstrip('/')}/api/v1/calendar/oauth/{provider}/callback"


def start_oauth(
    db: Session,
    user: User,
    provider: CalendarProvider,
    return_path: str,
) -> dict[str, str]:
    if not return_path.startswith("/portal/") or return_path.startswith("//"):
        raise HTTPException(status_code=400, detail="Calendar connections must return to the speaker portal.")
    client_id, _ = _provider_config(provider)
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    db.add(
        CalendarOAuthState(
            state=state,
            user_id=user.id,
            provider=provider,
            code_verifier=verifier,
            return_path=return_path,
            expires_at=utcnow() + timedelta(minutes=10),
        )
    )
    db.commit()

    if provider == "google":
        base = "https://accounts.google.com/o/oauth2/v2/auth"
        params = {
            "client_id": client_id,
            "redirect_uri": _redirect_uri(provider),
            "response_type": "code",
            "scope": GOOGLE_SCOPE,
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
    else:
        tenant = quote(settings.microsoft_calendar_tenant, safe="")
        base = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize"
        params = {
            "client_id": client_id,
            "redirect_uri": _redirect_uri(provider),
            "response_type": "code",
            "response_mode": "query",
            "scope": MICROSOFT_SCOPE,
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
    return {"authorization_url": f"{base}?{urlencode(params)}"}


def _token_url(provider: CalendarProvider) -> str:
    if provider == "google":
        return "https://oauth2.googleapis.com/token"
    tenant = quote(settings.microsoft_calendar_tenant, safe="")
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"


def _token_exchange(provider: CalendarProvider, code: str, verifier: str) -> dict[str, Any]:
    client_id, client_secret = _provider_config(provider)
    response = _http().post(
        _token_url(provider),
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": _redirect_uri(provider),
            "grant_type": "authorization_code",
        },
    )
    response.raise_for_status()
    return response.json()


def _account_email(provider: CalendarProvider, access_token: str) -> str | None:
    headers = {"Authorization": f"Bearer {access_token}"}
    if provider == "google":
        response = _http().get("https://openidconnect.googleapis.com/v1/userinfo", headers=headers)
        response.raise_for_status()
        return response.json().get("email")
    response = _http().get(
        "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", headers=headers
    )
    response.raise_for_status()
    data = response.json()
    return data.get("mail") or data.get("userPrincipalName")


def complete_oauth(db: Session, provider: CalendarProvider, state_value: str, code: str) -> tuple[User, str]:
    oauth_state = db.get(CalendarOAuthState, state_value)
    if (
        oauth_state is None
        or oauth_state.provider != provider
        or oauth_state.consumed_at is not None
        or oauth_state.expires_at < utcnow()
    ):
        raise HTTPException(status_code=400, detail="Calendar authorization state is invalid or expired.")

    try:
        token = _token_exchange(provider, code, oauth_state.code_verifier)
        access_token = token["access_token"]
        account_email = _account_email(provider, access_token)
    except (httpx.HTTPError, KeyError) as exc:
        raise HTTPException(status_code=502, detail="Calendar provider token exchange failed.") from exc

    connection = db.scalar(
        select(CalendarConnection).where(
            CalendarConnection.user_id == oauth_state.user_id,
            CalendarConnection.provider == provider,
        )
    )
    if connection is None:
        connection = CalendarConnection(
            user_id=oauth_state.user_id,
            provider=provider,
            access_token_encrypted=_encrypt(access_token),
        )
        db.add(connection)
    connection.provider_account_email = account_email
    connection.access_token_encrypted = _encrypt(access_token)
    if token.get("refresh_token"):
        connection.refresh_token_encrypted = _encrypt(token["refresh_token"])
    connection.expires_at = utcnow() + timedelta(seconds=int(token.get("expires_in", 3600)))
    connection.scopes_json = token.get("scope", "").split()
    connection.status = "active"
    connection.last_error = None
    oauth_state.consumed_at = utcnow()
    db.commit()
    user = db.get(User, oauth_state.user_id)
    return user, oauth_state.return_path


def _connection_view(db: Session, connection: CalendarConnection) -> dict[str, Any]:
    links = list(db.scalars(select(CalendarEventLink).where(CalendarEventLink.connection_id == connection.id)))
    return {
        "id": connection.id,
        "provider": connection.provider,
        "provider_account_email": connection.provider_account_email,
        "status": connection.status,
        "scopes": connection.scopes_json or [],
        "expires_at": connection.expires_at,
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


def _refresh(connection: CalendarConnection) -> str:
    if connection.expires_at is None or connection.expires_at > utcnow() + timedelta(minutes=1):
        return _decrypt(connection.access_token_encrypted)
    if not connection.refresh_token_encrypted:
        raise RuntimeError("Calendar access expired; reconnect the account.")
    provider: CalendarProvider = connection.provider  # type: ignore[assignment]
    client_id, client_secret = _provider_config(provider)
    response = _http().post(
        _token_url(provider),
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": _decrypt(connection.refresh_token_encrypted),
            "grant_type": "refresh_token",
            **({"scope": MICROSOFT_SCOPE} if provider == "microsoft" else {}),
        },
    )
    response.raise_for_status()
    token = response.json()
    connection.access_token_encrypted = _encrypt(token["access_token"])
    if token.get("refresh_token"):
        connection.refresh_token_encrypted = _encrypt(token["refresh_token"])
    connection.expires_at = utcnow() + timedelta(seconds=int(token.get("expires_in", 3600)))
    return token["access_token"]


def _event_body(repos: Repositories, session, provider: CalendarProvider) -> dict[str, Any]:
    event = repos.events.get(session.event_id)
    room = repos.rooms.get(session.room_id) if session.room_id else None
    people = []
    for participant in repos.session_participants.list_for_session(session.id):
        person = repos.people.get(participant.person_id)
        if person:
            people.append(" ".join(filter(None, [person.first_name, person.last_name])) or person.primary_email)
    description = re_strip_html(session.description or "")
    if people:
        description += f"\n\nSpeakers: {', '.join(people)}"
    description += f"\n\nSpeaker portal: {settings.web_app_url.rstrip('/')}/portal/{event.slug}"
    location = room.name if room else session.location or ""
    timezone = event.timezone or "UTC"
    start = session.starts_at.astimezone(ZoneInfo(timezone))
    end = session.ends_at.astimezone(ZoneInfo(timezone))
    if provider == "google":
        return {
            "summary": session.title,
            "description": description.strip(),
            "location": location,
            "start": {"dateTime": start.isoformat(), "timeZone": timezone},
            "end": {"dateTime": end.isoformat(), "timeZone": timezone},
        }
    return {
        "subject": session.title,
        "body": {"contentType": "text", "content": description.strip()},
        "location": {"displayName": location},
        "start": {"dateTime": start.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": timezone},
        "end": {"dateTime": end.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": timezone},
        "transactionId": deterministic_event_key(session.id, "microsoft"),
    }


def re_strip_html(value: str) -> str:
    import re

    return re.sub(r"<[^>]+>", " ", value).strip()


def deterministic_event_key(session_id: str, provider: str) -> str:
    digest = hashlib.sha256(f"open-session:{provider}:{session_id}".encode()).hexdigest()
    if provider == "microsoft":
        return f"{digest[:8]}-{digest[8:12]}-{digest[12:16]}-{digest[16:20]}-{digest[20:32]}"
    return digest[:32]


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
        token = _refresh(connection)
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        provider: CalendarProvider = connection.provider  # type: ignore[assignment]
        is_live = session.starts_at is not None and session.ends_at is not None and session.status != "cancelled"
        client = _http()
        if not is_live:
            if link.provider_event_id:
                if provider == "google":
                    event_id = quote(link.provider_event_id, safe="")
                    url = (
                        "https://www.googleapis.com/calendar/v3/calendars/primary/events/"
                        f"{event_id}?sendUpdates=none"
                    )
                else:
                    url = f"https://graph.microsoft.com/v1.0/me/events/{quote(link.provider_event_id, safe='')}"
                response = client.delete(url, headers=headers)
                if response.status_code not in (204, 404, 410):
                    response.raise_for_status()
            link.sync_status = "cancelled"
        else:
            body = _event_body(repos, session, provider)
            if provider == "google":
                base = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
                if link.provider_event_id:
                    response = client.patch(
                        f"{base}/{quote(link.provider_event_id, safe='')}?sendUpdates=none", headers=headers, json=body
                    )
                else:
                    body["id"] = deterministic_event_key(session.id, "google")
                    response = client.post(f"{base}?sendUpdates=none", headers=headers, json=body)
                    if response.status_code == 409:
                        response = client.patch(f"{base}/{body['id']}?sendUpdates=none", headers=headers, json=body)
            else:
                base = "https://graph.microsoft.com/v1.0/me/events"
                if link.provider_event_id:
                    response = client.patch(
                        f"{base}/{quote(link.provider_event_id, safe='')}", headers=headers, json=body
                    )
                else:
                    response = client.post(base, headers=headers, json=body)
            response.raise_for_status()
            data = response.json()
            link.provider_event_id = data.get("id") or link.provider_event_id
            link.provider_version = data.get("etag") or data.get("@odata.etag") or data.get("changeKey")
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
    db.execute(delete(CalendarEventLink).where(CalendarEventLink.connection_id == connection.id))
    db.delete(connection)
    db.commit()
