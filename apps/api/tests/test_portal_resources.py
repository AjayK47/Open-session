"""Portal resource pages (docx §8: "Resource and wiki pages within the speaker
portal, including HTML embed support") — organizer CRUD plus the read-only
speaker view, which must show published pages and hide drafts.
"""

import os
import tempfile
import uuid

from fastapi.testclient import TestClient

_temp_db = os.path.join(tempfile.gettempdir(), "open_session_portal_resources_test.db")
if os.path.exists(_temp_db):
    os.remove(_temp_db)
os.environ["OPEN_SESSION_DATABASE_URL"] = f"sqlite:///{_temp_db}"
os.environ["OPEN_SESSION_RATE_LIMIT_ENABLED"] = "false"
os.environ["OPEN_SESSION_EMAIL_ENABLED"] = "false"

from app.main import app  # noqa: E402


def _login(client: TestClient, email: str) -> None:
    code = client.post("/api/v1/auth/request-code", json={"email": email}).json()["dev_code"]
    assert client.post("/api/v1/auth/verify", json={"email": email, "code": code}).status_code == 200


def _event(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/events",
        json={
            "name": "Resources Test Conference",
            "slug": f"resources-test-{uuid.uuid4().hex[:8]}",
            "type": "conference",
            "timezone": "UTC",
            "program": {"tracks": [], "rooms": [], "formats": [], "tags": []},
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_organizer_can_crud_resources_and_only_published_ones_reach_the_portal():
    with TestClient(app) as client:
        _login(client, "organizer@resourcetest.org")
        event = _event(client)

        draft = client.post(
            f"/api/v1/events/{event['id']}/resources",
            json={"title": "Internal notes", "body_html": "<p>Not ready.</p>", "status": "draft"},
        )
        assert draft.status_code == 201, draft.text
        draft_id = draft.json()["id"]

        published = client.post(
            f"/api/v1/events/{event['id']}/resources",
            json={
                "title": "AV setup guide",
                "body_html": '<p>Bring an HDMI adapter.</p><iframe src="https://example.com/embed"></iframe>',
                "status": "published",
                "sort_order": 1,
            },
        )
        assert published.status_code == 201, published.text
        published_id = published.json()["id"]

        # Organizer listing shows both, draft included.
        organizer_view = client.get(f"/api/v1/events/{event['id']}/resources")
        assert organizer_view.status_code == 200
        titles = {row["title"] for row in organizer_view.json()}
        assert titles == {"Internal notes", "AV setup guide"}

        # Editing persists, including the embedded HTML.
        edited = client.patch(f"/api/v1/resources/{published_id}", json={"title": "AV & Streaming Setup"})
        assert edited.status_code == 200, edited.text
        assert edited.json()["title"] == "AV & Streaming Setup"
        assert "iframe" in edited.json()["body_html"]

        # A speaker with no role on this event is refused outright.
        _login(client, "outsider@resourcetest.org")
        blocked = client.get(f"/api/v1/events/{event['id']}/resources/published")
        assert blocked.status_code == 403

    # A speaker who does belong to the event sees only the published page.
    with TestClient(app) as speaker_client:
        _login(speaker_client, "organizer@resourcetest.org")
        speaker_view = speaker_client.get(f"/api/v1/events/{event['id']}/resources/published")
        assert speaker_view.status_code == 200
        rows = speaker_view.json()
        assert [r["title"] for r in rows] == ["AV & Streaming Setup"]
        assert rows[0]["id"] == published_id

        deleted = speaker_client.delete(f"/api/v1/resources/{draft_id}")
        assert deleted.status_code == 204
        remaining = speaker_client.get(f"/api/v1/events/{event['id']}/resources")
        assert [r["id"] for r in remaining.json()] == [published_id]
