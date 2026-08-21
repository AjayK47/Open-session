"""Multi-org mode (OPEN_SESSION_MULTI_ORG_ENABLED): isolation and switching.

Single-org mode (the default) is exercised by every other test in the suite —
these are specifically about what changes when the flag is on: open
self-serve org creation, per-user active-org resolution, and per-org
isolation of the CRM/people directory.
"""

import os
import tempfile
import uuid

import pytest
from fastapi.testclient import TestClient

_temp_db = os.path.join(tempfile.gettempdir(), "open_session_multi_org_test.db")
if os.path.exists(_temp_db):
    os.remove(_temp_db)
os.environ["OPEN_SESSION_DATABASE_URL"] = f"sqlite:///{_temp_db}"
os.environ["OPEN_SESSION_RATE_LIMIT_ENABLED"] = "false"
os.environ["OPEN_SESSION_EMAIL_ENABLED"] = "false"

from app.core.config import settings  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client_multi_org(monkeypatch):
    monkeypatch.setattr(settings, "multi_org_enabled", True)
    with TestClient(app) as c:
        yield c


def _login(client: TestClient, email: str) -> None:
    code = client.post("/api/v1/auth/request-code", json={"email": email}).json()["dev_code"]
    assert client.post("/api/v1/auth/verify", json={"email": email, "code": code}).status_code == 200


def _bootstrap_org(client: TestClient, slug: str) -> dict:
    res = client.post(
        "/api/v1/organization", json={"name": f"Org {slug}", "slug": slug, "default_timezone": "UTC"}
    )
    assert res.status_code == 201, res.text
    return res.json()


def _create_event(client: TestClient, slug: str | None = None) -> dict:
    slug = slug or f"event-{uuid.uuid4().hex[:8]}"
    res = client.post(
        "/api/v1/events",
        json={"name": "Conference", "slug": slug, "type": "conference", "timezone": "UTC"},
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_open_self_serve_bootstrap_requires_the_flag(client_multi_org):
    client = client_multi_org
    _login(client, "solo@example.com")
    org = _bootstrap_org(client, f"solo-{uuid.uuid4().hex[:8]}")
    assert org["name"].startswith("Org solo-")

    # A second bootstrap for the same (now-member) user is rejected — the
    # 409 is about *this user* already belonging to an org, not "the
    # deployment already has one".
    again = client.post(
        "/api/v1/organization", json={"name": "Second", "slug": f"second-{uuid.uuid4().hex[:8]}", "default_timezone": "UTC"}
    )
    assert again.status_code == 409
    assert "already belong" in again.json()["detail"]


def test_two_users_get_isolated_orgs_and_cannot_see_each_others_events(client_multi_org):
    client = client_multi_org

    _login(client, "alice@example.com")
    _bootstrap_org(client, f"alice-org-{uuid.uuid4().hex[:8]}")
    alice_event = _create_event(client)
    client.post("/api/v1/auth/logout")

    _login(client, "bob@example.com")
    _bootstrap_org(client, f"bob-org-{uuid.uuid4().hex[:8]}")
    bob_event = _create_event(client)

    bob_events = client.get("/api/v1/events").json()
    assert {e["id"] for e in bob_events} == {bob_event["id"]}
    assert alice_event["id"] not in {e["id"] for e in bob_events}

    # Bob cannot read Alice's event directly either.
    assert client.get(f"/api/v1/events/{alice_event['id']}").status_code == 403


def test_active_organization_switches(client_multi_org):
    client = client_multi_org
    _login(client, "carol@example.com")
    org_a = _bootstrap_org(client, f"carol-a-{uuid.uuid4().hex[:8]}")

    # Join a second org via direct membership isn't exposed by an API in this
    # pass (invite flow covers that path); simulate by bootstrapping fresh
    # after leaving isn't possible either, so this test only exercises
    # switching back to the same org, which still proves the endpoint and
    # resolve_active plumbing work end to end.
    switched = client.post("/api/v1/organization/active", json={"organization_id": org_a["id"]})
    assert switched.status_code == 200
    assert switched.json()["organization"]["id"] == org_a["id"]

    context = client.get("/api/v1/organization/context").json()
    assert context["organization"]["id"] == org_a["id"]
    assert [o["id"] for o in context["organizations"]] == [org_a["id"]]


def test_same_email_in_two_orgs_is_two_distinct_people(client_multi_org):
    client = client_multi_org

    _login(client, "org-owner-1@example.com")
    _bootstrap_org(client, f"speakers-a-{uuid.uuid4().hex[:8]}")
    event_a = _create_event(client)
    speaker_a = client.post(
        f"/api/v1/events/{event_a['id']}/speakers",
        json={"email": "shared-speaker@example.com", "first_name": "Shared", "last_name": "Speaker"},
    )
    assert speaker_a.status_code == 201, speaker_a.text
    client.post("/api/v1/auth/logout")

    _login(client, "org-owner-2@example.com")
    _bootstrap_org(client, f"speakers-b-{uuid.uuid4().hex[:8]}")
    event_b = _create_event(client)
    speaker_b = client.post(
        f"/api/v1/events/{event_b['id']}/speakers",
        json={"email": "shared-speaker@example.com", "first_name": "Shared", "last_name": "Speaker"},
    )
    assert speaker_b.status_code == 201, speaker_b.text

    assert speaker_a.json()["person_id"] != speaker_b.json()["person_id"]
