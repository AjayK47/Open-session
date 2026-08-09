"""The public widget payload: what it exposes, what it hides, and in what order.

Every widget reads this one endpoint, so these assertions are effectively the
contract for all five attendee-facing surfaces.
"""

import os
import tempfile
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

# Throwaway database, chosen before importing the app so the suite can never run
# against the development database sitting in apps/api.
_temp_db = os.path.join(tempfile.gettempdir(), "open_session_public_widgets_test.db")
if os.path.exists(_temp_db):
    os.remove(_temp_db)
os.environ["OPEN_SESSION_DATABASE_URL"] = f"sqlite:///{_temp_db}"
os.environ["OPEN_SESSION_RATE_LIMIT_ENABLED"] = "false"
# Also pinned so a local .env with real Cloudflare credentials can't make the
# suite try to send mail (and withhold the dev sign-in code).
os.environ["OPEN_SESSION_EMAIL_ENABLED"] = "false"

from app.main import app  # noqa: E402


def _login(client: TestClient, email: str) -> None:
    code = client.post("/api/v1/auth/request-code", json={"email": email}).json()["dev_code"]
    assert client.post("/api/v1/auth/verify", json={"email": email, "code": code}).status_code == 200


def _event(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/events",
        json={
            "name": "Widget Conference",
            "slug": f"widget-conf-{uuid.uuid4().hex[:8]}",
            "type": "conference",
            "timezone": "America/Los_Angeles",
            "starts_at": "2027-03-01T09:00:00Z",
            "ends_at": "2027-03-02T18:00:00Z",
            "program": {
                "tracks": [{"name": "Agents", "color": "#7c5cff"}],
                "rooms": [{"name": "Main Hall"}],
                "formats": [{"name": "Talk", "default_duration_minutes": 45}],
                "tags": [],
            },
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _session(client: TestClient, event: dict, title: str, speaker_email: str, last_name: str) -> dict:
    track = client.get(f"/api/v1/events/{event['id']}/tracks").json()[0]
    fmt = client.get(f"/api/v1/events/{event['id']}/formats").json()[0]
    response = client.post(
        f"/api/v1/events/{event['id']}/sessions",
        json={
            "title": title,
            "description": "<p>Deep dive.</p>",
            "track_id": track["id"],
            "format_id": fmt["id"],
            "duration_minutes": 45,
            "participants": [
                {"email": speaker_email, "first_name": "Alex", "last_name": last_name, "role": "speaker"}
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _schedule(client: TestClient, event: dict, session: dict, starts_at: str, ends_at: str) -> None:
    room = client.get(f"/api/v1/events/{event['id']}/rooms").json()[0]
    response = client.patch(
        f"/api/v1/sessions/{session['id']}/schedule",
        json={"room_id": room["id"], "starts_at": starts_at, "ends_at": ends_at},
    )
    assert response.status_code == 200, response.text


def test_public_program_hides_unapproved_and_sorts_by_time_then_surname():
    with TestClient(app) as client:
        _login(client, "organizer@widgetconf.org")
        event = _event(client)

        late = _session(client, event, "Zebra keynote", "zoe@widgetconf.org", "Zephyr")
        early = _session(client, event, "Alpha workshop", "alex@widgetconf.org", "Abara")
        draft = _session(client, event, "Never published", "nobody@widgetconf.org", "Nobody")

        _schedule(client, event, late, "2027-03-01T18:00:00Z", "2027-03-01T18:45:00Z")
        _schedule(client, event, early, "2027-03-01T17:00:00Z", "2027-03-01T17:45:00Z")
        png = bytes.fromhex("89504e470d0a1a0a")
        headshot = client.post(
            f"/api/v1/events/{event['id']}/files/upload-intent",
            json={
                "filename": "alex.png",
                "content_type": "image/png",
                "size_bytes": len(png),
                "file_type": "headshot",
                "person_id": early["participants"][0]["person_id"],
            },
        ).json()
        assert client.post(headshot["upload_url"], content=png).status_code == 200

        # Nothing is public before the organizer publishes.
        program = client.get(f"/api/v1/public/events/{event['slug']}/program").json()
        assert program["sessions"] == []
        assert program["event"]["agenda_published_at"] is None

        published = client.post(f"/api/v1/events/{event['id']}/agenda/publish")
        assert published.status_code == 200, published.text
        assert published.json()["public_url"].endswith(f"/e/{event['slug']}/agenda")

    # A brand-new client proves the payload needs no session cookie at all.
    with TestClient(app) as anonymous:
        program = anonymous.get(f"/api/v1/public/events/{event['slug']}/program").json()

        titles = [s["title"] for s in program["sessions"]]
        assert titles == ["Alpha workshop", "Zebra keynote"], "scheduled sessions sort by start time"
        assert draft["title"] not in titles, "unscheduled, unapproved sessions stay hidden"

        assert program["event"]["timezone"] == "America/Los_Angeles"
        assert program["event"]["agenda_published_at"] is not None

        surnames = [s["last_name"] for s in program["speakers"]]
        assert surnames == ["Abara", "Zephyr"], "speakers are alphabetised by surname"

        # Each speaker carries the sessions they appear on, so the speakers and
        # gallery widgets never have to re-join against the session list.
        abara = program["speakers"][0]
        assert [s["title"] for s in abara["sessions"]] == ["Alpha workshop"]

        first = program["sessions"][0]
        assert first["track"]["name"] == "Agents"
        assert first["format"]["name"] == "Talk"
        assert first["room"]["name"] == "Main Hall"
        assert first["speakers"][0]["name"] == "Alex Abara"
        assert first["speakers"][0]["headshot_file_id"] == headshot["id"]
        public_photo = anonymous.get(f"/api/v1/public/files/{headshot['id']}/headshot")
        assert public_photo.status_code == 200
        assert public_photo.headers["content-type"] == "image/png"
        assert anonymous.get(f"/api/v1/files/{headshot['id']}/download").status_code == 401


def test_auto_schedule_uses_the_events_timezone_not_utc():
    """A San Francisco conference must not start its first session at midnight."""
    with TestClient(app) as client:
        _login(client, "organizer2@widgetconf.org")
        event = _event(client)
        _session(client, event, "Opening talk", "opener@widgetconf.org", "Opener")

        placed = client.post(f"/api/v1/events/{event['id']}/agenda/auto-schedule")
        assert placed.status_code == 200, placed.text
        assert placed.json()["placed"] == 1

        client.post(f"/api/v1/events/{event['id']}/agenda/publish")
        program = client.get(f"/api/v1/public/events/{event['slug']}/program").json()

        starts_at = datetime.fromisoformat(program["sessions"][0]["starts_at"])
        local = starts_at.astimezone(ZoneInfo("America/Los_Angeles"))
        assert local.hour == 8, f"expected an 08:00 local start, got {local.isoformat()}"
        assert local.date().isoformat() == "2027-03-01"


def test_public_event_listing_only_shows_published_agendas():
    """Backs the slugless /sessions, /agenda, … URLs, which have no slug to resolve."""
    with TestClient(app) as client:
        _login(client, "organizer3@widgetconf.org")
        unpublished = _event(client)
        published = _event(client)
        _session(client, published, "Opening talk", "opener3@widgetconf.org", "Opener")
        client.post(f"/api/v1/events/{published['id']}/agenda/auto-schedule")
        client.post(f"/api/v1/events/{published['id']}/agenda/publish")

    with TestClient(app) as anonymous:
        response = anonymous.get("/api/v1/public/events")
        assert response.status_code == 200, response.text
        slugs = [event["slug"] for event in response.json()]
        assert published["slug"] in slugs
        assert unpublished["slug"] not in slugs, "an unpublished agenda must stay invisible"


def test_public_program_404s_on_unknown_slug():
    with TestClient(app) as client:
        assert client.get("/api/v1/public/events/no-such-event/program").status_code == 404
