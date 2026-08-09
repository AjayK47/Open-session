from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services import calendar_service


def _login(client: TestClient, email: str) -> None:
    code = client.post("/api/v1/auth/request-code", json={"email": email}).json()["dev_code"]
    assert client.post("/api/v1/auth/verify", json={"email": email, "code": code}).status_code == 200


class FakeResponse:
    def __init__(self, data=None, status_code=200):
        self._data = data or {}
        self.status_code = status_code

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"provider status {self.status_code}")


class FakeCalendarHttp:
    def __init__(self, provider: str):
        self.provider = provider
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append(("POST", url, kwargs))
        event_id = "google-event-1" if self.provider == "google" else "microsoft-event-1"
        return FakeResponse({"id": event_id, "etag": "v1", "@odata.etag": "v1"})

    def patch(self, url, **kwargs):
        self.calls.append(("PATCH", url, kwargs))
        event_id = "google-event-1" if self.provider == "google" else "microsoft-event-1"
        return FakeResponse({"id": event_id, "etag": "v2", "@odata.etag": "v2"})

    def delete(self, url, **kwargs):
        self.calls.append(("DELETE", url, kwargs))
        return FakeResponse(status_code=204)


@pytest.mark.parametrize("provider", ["google", "microsoft"])
def test_speaker_calendar_oauth_create_update_cancel_and_disconnect(monkeypatch, provider):
    email = f"calendar-{provider}@example.com"
    fake_http = FakeCalendarHttp(provider)
    monkeypatch.setattr(settings, "google_calendar_client_id", "google-client")
    monkeypatch.setattr(settings, "google_calendar_client_secret", "google-secret")
    monkeypatch.setattr(settings, "microsoft_calendar_client_id", "microsoft-client")
    monkeypatch.setattr(settings, "microsoft_calendar_client_secret", "microsoft-secret")
    monkeypatch.setattr(
        calendar_service,
        "_token_exchange",
        lambda selected_provider, code, verifier: {
            "access_token": f"{selected_provider}-access",
            "refresh_token": f"{selected_provider}-refresh",
            "expires_in": 3600,
            "scope": "calendar-write",
        },
    )
    monkeypatch.setattr(calendar_service, "_account_email", lambda selected_provider, token: email)

    with TestClient(app) as client:
        _login(client, email)
        event = client.post(
            "/api/v1/events",
            json={
                "name": "Calendar Test",
                "slug": f"calendar-{provider}-event",
                "timezone": "America/Los_Angeles",
                "starts_at": "2027-05-12T16:00:00Z",
                "ends_at": "2027-05-13T01:00:00Z",
                "program": {"rooms": [{"name": "Main Stage"}]},
            },
        ).json()
        room = client.get(f"/api/v1/events/{event['id']}/rooms").json()[0]
        session = client.post(
            f"/api/v1/events/{event['id']}/sessions",
            json={
                "title": "Calendar contract test",
                "duration_minutes": 30,
                "participants": [{"email": email, "role": "speaker", "first_name": "Calendar"}],
            },
        ).json()

        started = client.post(
            f"/api/v1/calendar/oauth/{provider}/start",
            json={"return_path": f"/portal/{event['slug']}/calendar"},
        )
        assert started.status_code == 200, started.text
        authorization_url = started.json()["authorization_url"]
        state = parse_qs(urlparse(authorization_url).query)["state"][0]
        assert "code_challenge" in parse_qs(urlparse(authorization_url).query)

        callback = client.get(
            f"/api/v1/calendar/oauth/{provider}/callback",
            params={"state": state, "code": "provider-code"},
            follow_redirects=False,
        )
        assert callback.status_code == 302
        assert f"/portal/{event['slug']}/calendar" in callback.headers["location"]

        connection = client.get("/api/v1/calendar/connections").json()[0]
        assert connection["provider"] == provider
        assert connection["provider_account_email"] == email
        assert "access_token" not in connection

        monkeypatch.setattr(calendar_service, "_http", lambda: fake_http)
        scheduled = client.patch(
            f"/api/v1/sessions/{session['id']}/schedule",
            json={
                "room_id": room["id"],
                "starts_at": "2027-05-12T18:00:00Z",
                "ends_at": "2027-05-12T18:30:00Z",
            },
        )
        assert scheduled.status_code == 200, scheduled.text
        assert fake_http.calls[-1][0] == "POST"

        updated = client.patch(f"/api/v1/sessions/{session['id']}", json={"title": "Updated calendar title"})
        assert updated.status_code == 200
        assert fake_http.calls[-1][0] == "PATCH"

        cancelled = client.patch(f"/api/v1/sessions/{session['id']}", json={"status": "cancelled"})
        assert cancelled.status_code == 200
        assert fake_http.calls[-1][0] == "DELETE"

        assert client.delete(f"/api/v1/calendar/connections/{connection['id']}").status_code == 204
        assert client.get("/api/v1/calendar/connections").json() == []
