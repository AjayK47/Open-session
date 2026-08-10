from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services import calendar_service


@pytest.fixture(autouse=True)
def local_auth(monkeypatch):
    monkeypatch.setattr(settings, "environment", "development")
    monkeypatch.setattr(settings, "email_enabled", False)
    monkeypatch.setattr(settings, "rate_limit_enabled", False)


def _login(client: TestClient, email: str) -> str:
    code = client.post("/api/v1/auth/request-code", json={"email": email}).json()["dev_code"]
    response = client.post("/api/v1/auth/verify", json={"email": email, "code": code})
    assert response.status_code == 200
    return response.json()["id"]


class FakeComposioSession:
    def __init__(self, owner, user_id: str, toolkits: list[str]):
        self.owner = owner
        self.user_id = user_id
        self.toolkits = toolkits

    def authorize(self, toolkit: str, callback_url: str):
        self.owner.authorizations.append((self.user_id, toolkit, callback_url))
        return SimpleNamespace(redirect_url=f"https://connect.composio.test/link/{self.user_id}/{toolkit}")


class FakeSessions:
    def __init__(self, owner):
        self.owner = owner

    def create(self, *, user_id: str, toolkits: list[str], manage_connections: bool):
        assert manage_connections is False
        self.owner.session_user_ids.append(user_id)
        return FakeComposioSession(self.owner, user_id, toolkits)


class FakeConnectedAccounts:
    def __init__(self, owner):
        self.owner = owner

    def get(self, connected_account_id: str):
        return self.owner.accounts[connected_account_id]

    def delete(self, connected_account_id: str, *, revoke_on_delete: bool):
        self.owner.deleted_accounts.append((connected_account_id, revoke_on_delete))


class FakeTools:
    def __init__(self, owner):
        self.owner = owner

    def execute(
        self,
        slug: str,
        arguments: dict,
        *,
        user_id: str,
        connected_account_id: str,
        version: str,
    ):
        self.owner.tool_calls.append(
            {
                "slug": slug,
                "arguments": arguments,
                "user_id": user_id,
                "connected_account_id": connected_account_id,
                "version": version,
            }
        )
        event_id = "google-event-1" if slug.startswith("GOOGLECALENDAR") else "microsoft-event-1"
        return SimpleNamespace(successful=True, error=None, data={"response_data": {"id": event_id}})


class FakeComposio:
    def __init__(self):
        self.accounts = {}
        self.session_user_ids = []
        self.authorizations = []
        self.deleted_accounts = []
        self.tool_calls = []
        self.sessions = FakeSessions(self)
        self.connected_accounts = FakeConnectedAccounts(self)
        self.tools = FakeTools(self)


@pytest.mark.parametrize(
    ("provider", "toolkit", "create_slug", "update_slug", "delete_slug"),
    [
        (
            "google",
            "googlecalendar",
            "GOOGLECALENDAR_CREATE_EVENT",
            "GOOGLECALENDAR_PATCH_EVENT",
            "GOOGLECALENDAR_DELETE_EVENT",
        ),
        (
            "microsoft",
            "outlook",
            "OUTLOOK_CALENDAR_CREATE_EVENT",
            "OUTLOOK_UPDATE_CALENDAR_EVENT",
            "OUTLOOK_DELETE_CALENDAR_EVENT",
        ),
    ],
)
def test_speaker_composio_calendar_create_update_cancel_and_disconnect(
    monkeypatch,
    provider,
    toolkit,
    create_slug,
    update_slug,
    delete_slug,
):
    email = f"calendar-{provider}@example.com"
    fake = FakeComposio()
    monkeypatch.setattr(settings, "composio_api_key", "test-composio-key")
    monkeypatch.setattr(calendar_service, "_client", lambda: fake)

    with TestClient(app) as client:
        user_id = _login(client, email)
        event_response = client.post(
            "/api/v1/events",
            json={
                "name": "Calendar Test",
                "slug": f"calendar-{provider}-{uuid4().hex[:8]}",
                "timezone": "America/Los_Angeles",
                "starts_at": "2027-05-12T16:00:00Z",
                "ends_at": "2027-05-13T01:00:00Z",
                "program": {"rooms": [{"name": "Main Stage"}]},
            },
        )
        assert event_response.status_code == 201, event_response.text
        event = event_response.json()
        room = client.get(f"/api/v1/events/{event['id']}/rooms").json()[0]
        session = client.post(
            f"/api/v1/events/{event['id']}/sessions",
            json={
                "title": "Calendar contract test",
                "duration_minutes": 30,
                "participants": [{"email": email, "role": "speaker", "first_name": "Calendar"}],
            },
        ).json()

        availability = client.get("/api/v1/calendar/availability")
        assert availability.json() == {"enabled": True, "providers": ["google", "microsoft"]}

        started = client.post(
            f"/api/v1/calendar/composio/{provider}/start",
            json={"return_path": f"/portal/{event['slug']}/calendar"},
        )
        assert started.status_code == 200, started.text
        assert started.json()["authorization_url"].startswith("https://connect.composio.test/link/")
        assert fake.session_user_ids == [user_id]
        assert fake.authorizations[0][1] == toolkit
        assert "calendar_provider=" in fake.authorizations[0][2]

        connected_account_id = f"ca_{provider}_speaker"
        fake.accounts[connected_account_id] = SimpleNamespace(
            id=connected_account_id,
            user_id=user_id,
            toolkit=SimpleNamespace(slug=toolkit),
            status="ACTIVE",
            data={"email": email},
            params={},
            state={},
        )
        completed = client.post(
            f"/api/v1/calendar/composio/{provider}/complete",
            json={"connected_account_id": connected_account_id},
        )
        assert completed.status_code == 200, completed.text
        connection = completed.json()
        assert connection["provider"] == provider
        assert connection["provider_account_email"] == email
        assert "composio_connected_account_id" not in connection

        scheduled = client.patch(
            f"/api/v1/sessions/{session['id']}/schedule",
            json={
                "room_id": room["id"],
                "starts_at": "2027-05-12T18:00:00Z",
                "ends_at": "2027-05-12T18:30:00Z",
            },
        )
        assert scheduled.status_code == 200, scheduled.text
        assert fake.tool_calls[-1]["slug"] == create_slug
        assert fake.tool_calls[-1]["user_id"] == user_id
        assert fake.tool_calls[-1]["connected_account_id"] == connected_account_id

        updated = client.patch(f"/api/v1/sessions/{session['id']}", json={"title": "Updated calendar title"})
        assert updated.status_code == 200
        assert fake.tool_calls[-1]["slug"] == update_slug

        cancelled = client.patch(f"/api/v1/sessions/{session['id']}", json={"status": "cancelled"})
        assert cancelled.status_code == 200
        assert fake.tool_calls[-1]["slug"] == delete_slug

        assert client.delete(f"/api/v1/calendar/connections/{connection['id']}").status_code == 204
        assert fake.deleted_accounts == [(connected_account_id, True)]
        assert client.get("/api/v1/calendar/connections").json() == []


def test_composio_connection_is_bound_to_distinct_open_session_user_ids(monkeypatch):
    fake = FakeComposio()
    monkeypatch.setattr(settings, "composio_api_key", "test-composio-key")
    monkeypatch.setattr(calendar_service, "_client", lambda: fake)

    with TestClient(app) as first, TestClient(app) as second:
        first_id = _login(first, "first-calendar-user@example.com")
        second_id = _login(second, "second-calendar-user@example.com")
        assert first_id != second_id
        for client in (first, second):
            response = client.post(
                "/api/v1/calendar/composio/google/start",
                json={"return_path": "/portal/sample/calendar"},
            )
            assert response.status_code == 200
        assert fake.session_user_ids == [first_id, second_id]

        fake.accounts["ca_first_user"] = SimpleNamespace(
            id="ca_first_user",
            user_id=first_id,
            toolkit=SimpleNamespace(slug="googlecalendar"),
            status="ACTIVE",
            data={"email": "first-calendar-user@example.com"},
            params={},
            state={},
        )
        stolen = second.post(
            "/api/v1/calendar/composio/google/complete",
            json={"connected_account_id": "ca_first_user"},
        )
        assert stolen.status_code == 403


def test_composio_calendar_is_optional(monkeypatch):
    monkeypatch.setattr(settings, "composio_api_key", None)
    with TestClient(app) as client:
        _login(client, "ics-only@example.com")
        assert client.get("/api/v1/calendar/availability").json() == {"enabled": False, "providers": []}
        response = client.post(
            "/api/v1/calendar/composio/google/start",
            json={"return_path": "/portal/sample/calendar"},
        )
        assert response.status_code == 503
