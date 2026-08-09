import os
import tempfile

import pytest
from fastapi.testclient import TestClient

_temp_db = os.path.join(tempfile.gettempdir(), "open_session_test.db")
if os.path.exists(_temp_db):
    os.remove(_temp_db)
os.environ["OPEN_SESSION_DATABASE_URL"] = f"sqlite:///{_temp_db}"
# Functional suites log in dozens of times from the TestClient's shared "testclient"
# IP within one shared db file; rate limiting is exercised in isolation instead
# (see test_rate_limit.py).
os.environ["OPEN_SESSION_RATE_LIMIT_ENABLED"] = "false"

from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def _login(client: TestClient, email: str) -> str:
    code = client.post("/api/v1/auth/request-code", json={"email": email}).json()["dev_code"]
    assert code, "expected a dev code in development mode"
    res = client.post("/api/v1/auth/verify", json={"email": email, "code": code})
    assert res.status_code == 200
    return res.json()["id"]


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["ok"] == "true"


def test_auth_requires_session(client):
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get("/api/v1/events").status_code == 401


def test_magic_link_login_flow(client):
    user_id = _login(client, "organizer@example.com")
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "organizer@example.com"
    assert me.json()["id"] == user_id

    client.post("/api/v1/auth/logout")
    assert client.get("/api/v1/auth/me").status_code == 401


def test_invalid_code_rejected(client):
    client.post("/api/v1/auth/request-code", json={"email": "bad@example.com"})
    res = client.post("/api/v1/auth/verify", json={"email": "bad@example.com", "code": "000000"})
    assert res.status_code == 400


def test_evaluation_login_is_hidden_by_default(client):
    assert client.get("/api/v1/auth/evaluation-personas").json() == []
    response = client.post("/api/v1/auth/evaluation-login", json={"persona": "organizer"})
    assert response.status_code == 404


def test_evaluation_login_only_uses_preseeded_personas(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "evaluation_mode", True)
    monkeypatch.setattr(settings, "evaluation_organizer_email", "evaluation-owner@example.com")

    missing = client.post("/api/v1/auth/evaluation-login", json={"persona": "organizer"})
    assert missing.status_code == 409

    _login(client, "evaluation-owner@example.com")
    client.post("/api/v1/auth/logout")

    personas = client.get("/api/v1/auth/evaluation-personas")
    assert personas.status_code == 200
    assert personas.json()[0] == {
        "persona": "organizer",
        "label": "Organizer",
        "email": "evaluation-owner@example.com",
        "start_path": "/app/events",
    }

    signed_in = client.post("/api/v1/auth/evaluation-login", json={"persona": "organizer"})
    assert signed_in.status_code == 200
    assert client.get("/api/v1/auth/me").json()["email"] == "evaluation-owner@example.com"


def _create_event(client: TestClient, slug: str | None = None) -> dict:
    import uuid

    slug = slug or f"event-{uuid.uuid4().hex[:8]}"
    res = client.post(
        "/api/v1/events",
        json={
            "name": "AI Engineer Conference 2026",
            "slug": slug,
            "type": "conference",
            "timezone": "UTC",
            "location": "San Francisco, CA",
            "starts_at": "2026-11-10T09:00:00Z",
            "ends_at": "2026-11-12T18:00:00Z",
            "program": {
                "tracks": [{"name": "AI Agents", "color": "#0ea5e9"}, {"name": "Security"}],
                "rooms": [{"name": "Room A", "capacity": 300}],
                "formats": [{"name": "Talk", "default_duration_minutes": 45}],
                "tags": [{"name": "agents"}],
            },
        },
    )
    assert res.status_code == 201
    return res.json()


def test_create_and_read_event_with_program_seed(client):
    _login(client, "owner@example.com")
    event = _create_event(client)

    assert event["status"] == "draft"
    assert event["name"] == "AI Engineer Conference 2026"

    listed = client.get("/api/v1/events")
    assert listed.status_code == 200
    assert any(e["id"] == event["id"] for e in listed.json())

    for path, expected in [
        ("tracks", ["AI Agents", "Security"]),
        ("rooms", ["Room A"]),
        ("formats", ["Talk"]),
        ("tags", ["agents"]),
    ]:
        items = client.get(f"/api/v1/events/{event['id']}/{path}")
        assert items.status_code == 200
        assert [i["name"] for i in items.json()] == expected


def test_duplicate_slug_conflict(client):
    _login(client, "owner2@example.com")
    _create_event(client, slug="dup-slug-2026")
    res = client.post(
        "/api/v1/events",
        json={"name": "Other", "slug": "dup-slug-2026", "type": "conference", "timezone": "UTC"},
    )
    assert res.status_code == 409


def test_program_config_crud(client):
    _login(client, "owner3@example.com")
    event = _create_event(client, slug="crud-2026")
    event_id = event["id"]

    track = client.post(f"/api/v1/events/{event_id}/tracks", json={"name": "UX"}).json()
    patched = client.patch(
        f"/api/v1/events/{event_id}/tracks/{track['id']}", json={"description": "Human-centered design"}
    )
    assert patched.status_code == 200
    assert patched.json()["description"] == "Human-centered design"
    assert "UX" in [t["name"] for t in client.get(f"/api/v1/events/{event_id}/tracks").json()]


def test_rbac_blocks_unauthorized_user(client):
    _login(client, "rbac-owner@example.com")
    event = _create_event(client, slug="rbac-2026")

    with TestClient(app) as stranger:
        _login(stranger, "stranger@example.com")
        assert stranger.get(f"/api/v1/events/{event['id']}").status_code == 403
        assert stranger.patch(f"/api/v1/events/{event['id']}", json={"name": "hack"}).status_code == 403

    # owner can update
    res = client.patch(f"/api/v1/events/{event['id']}", json={"description": "Updated"})
    assert res.status_code == 200
    assert res.json()["description"] == "Updated"


def test_nonexistent_event_404(client):
    _login(client, "ghost@example.com")
    assert client.get("/api/v1/events/does-not-exist").status_code == 404
