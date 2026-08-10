import os
import tempfile

import pytest
from fastapi.testclient import TestClient

_temp_db = os.path.join(tempfile.gettempdir(), "open_session_cfp_test.db")
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


def _login(client: TestClient, email: str) -> None:
    code = client.post("/api/v1/auth/request-code", json={"email": email}).json()["dev_code"]
    client.post("/api/v1/auth/verify", json={"email": email, "code": code})


def _create_event_with_program(client: TestClient) -> dict:
    import uuid

    slug = f"cfp-{uuid.uuid4().hex[:8]}"
    res = client.post(
        "/api/v1/events",
        json={
            "name": "AI Engineer Conference 2026",
            "slug": slug,
            "type": "conference",
            "timezone": "UTC",
            "program": {
                "tracks": [{"name": "AI Agents", "color": "#0ea5e9"}, {"name": "Security"}],
                "rooms": [{"name": "Room A"}],
                "formats": [
                    {"name": "Talk", "default_duration_minutes": 45},
                    {"name": "Workshop", "default_duration_minutes": 90},
                ],
                "tags": [{"name": "agents"}, {"name": "llm"}],
            },
        },
    )
    assert res.status_code == 201
    return res.json()


def _form_payload(client: TestClient, event_id: str, slug: str = "ai-agent-cfp") -> dict:
    tracks = client.get(f"/api/v1/events/{event_id}/tracks").json()
    formats = client.get(f"/api/v1/events/{event_id}/formats").json()
    tags = client.get(f"/api/v1/events/{event_id}/tags").json()
    workshop = next(f for f in formats if f["name"] == "Workshop")
    agents = next(t for t in tracks if t["name"] == "AI Agents")
    agents_tag = next(t for t in tags if t["name"] == "agents")

    return {
        "internal_name": "AI Agent CFP",
        "public_title": "Call for Speakers — AI Engineer Conference 2026",
        "slug": slug,
        "submission_type": "abstract",
        "participant_roles": [{"role": "speaker", "min": 1, "max": 1}],
        "sections": [
            {
                "key": "proposal",
                "title": "Proposal",
                "instructions": "Tell us about your talk.",
                "fields": [
                    {
                        "key": "title",
                        "label": "Talk title",
                        "field_type": "system",
                        "system_field": "title",
                        "required": True,
                    },
                    {
                        "key": "description",
                        "label": "Abstract",
                        "field_type": "system",
                        "system_field": "description",
                        "required": True,
                    },
                    {
                        "key": "track",
                        "label": "Track",
                        "field_type": "system",
                        "system_field": "track",
                        "required": True,
                    },
                    {
                        "key": "format",
                        "label": "Format",
                        "field_type": "system",
                        "system_field": "format",
                        "required": True,
                    },
                    {
                        "key": "workshop_duration",
                        "label": "Workshop duration (min)",
                        "field_type": "number",
                        "required": False,
                    },
                    {
                        "key": "audience",
                        "label": "Audience",
                        "field_type": "dropdown",
                        "required": True,
                        "options": ["Everyone", "Engineers", "Managers"],
                    },
                ],
            }
        ],
        "conditional_rules": [
            {
                "field": "format",
                "operator": "equals",
                "value": workshop["id"],
                "actions": [{"kind": "require", "target": "workshop_duration"}],
            }
        ],
        "routing_rules": [
            {
                "trigger": {"field": "track", "operator": "equals", "value": agents["id"]},
                "actions": [{"kind": "add_tag", "value": agents_tag["id"]}],
            }
        ],
        "close_at": "2026-12-31T23:59:59Z",
        "submission_limit": 5,
    }


def _submission_payload(
    event_id: str, track_id: str, format_id: str, audience: str = "Everyone", **extra_answers
) -> dict:
    return {
        "title": "Building Production AI Agents",
        "description": "How we shipped an agent platform in production.",
        "track_id": track_id,
        "format_id": format_id,
        "custom_answers": {"audience": audience, **extra_answers},
        "participants": [
            {
                "email": "speaker@example.com",
                "role": "speaker",
                "first_name": "Ada",
                "last_name": "Lovelace",
                "company": "Analytical Engines",
                "job_title": "Chief Scientist",
            }
        ],
    }


def test_create_publish_and_public_schema(client):
    _login(client, "owner@example.com")
    event = _create_event_with_program(client)
    form = client.post(f"/api/v1/events/{event['id']}/forms", json=_form_payload(client, event["id"]))
    assert form.status_code == 201, form.text
    form_id = form.json()["id"]

    published = client.post(f"/api/v1/forms/{form_id}/publish")
    assert published.status_code == 200
    assert published.json()["status"] == "open"

    schema = client.get(f"/api/v1/public/forms/{event['slug']}/ai-agent-cfp")
    assert schema.status_code == 200
    body = schema.json()
    assert body["event"]["name"] == "AI Engineer Conference 2026"
    assert body["status"] == "open"
    assert [f["key"] for f in body["sections"][0]["fields"]] == [
        "title",
        "description",
        "track",
        "format",
        "workshop_duration",
        "audience",
    ]
    # tracks/formats/tags are exposed so the public form can render real choices,
    # not free text, for the system fields (§9.3).
    assert any(t["name"] for t in body["tracks"])
    assert any(f["name"] for f in body["formats"])

    event_summary = client.get(f"/api/v1/public/events/{event['slug']}")
    assert event_summary.status_code == 200
    assert event_summary.json()["id"] == event["id"]


def test_duplicate_form(client):
    _login(client, "owner@example.com")
    event = _create_event_with_program(client)
    form = client.post(f"/api/v1/events/{event['id']}/forms", json=_form_payload(client, event["id"]))
    dup = client.post(f"/api/v1/forms/{form.json()['id']}/duplicate")
    assert dup.status_code == 201
    assert dup.json()["status"] == "draft"
    assert dup.json()["slug"].startswith("ai-agent-cfp-")


def test_delete_empty_form_but_preserve_forms_with_submissions(client):
    _login(client, "owner-delete@example.com")
    event = _create_event_with_program(client)

    empty_form = client.post(
        f"/api/v1/events/{event['id']}/forms",
        json=_form_payload(client, event["id"], slug="empty-form"),
    ).json()
    deleted = client.delete(f"/api/v1/forms/{empty_form['id']}")
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/forms/{empty_form['id']}").status_code == 404

    active_form = client.post(
        f"/api/v1/events/{event['id']}/forms",
        json=_form_payload(client, event["id"], slug="active-form"),
    ).json()
    assert client.post(f"/api/v1/forms/{active_form['id']}/publish").status_code == 200
    tracks = client.get(f"/api/v1/events/{event['id']}/tracks").json()
    formats = client.get(f"/api/v1/events/{event['id']}/formats").json()
    code = client.post(
        f"/api/v1/public/forms/{event['slug']}/active-form/auth/request-code",
        json={"email": "speaker-delete@example.com"},
    ).json()["dev_code"]
    client.post(
        f"/api/v1/public/forms/{event['slug']}/active-form/auth/verify",
        json={"email": "speaker-delete@example.com", "code": code},
    )
    draft = client.post(
        f"/api/v1/public/forms/{event['slug']}/active-form/submissions",
        json=_submission_payload(event["id"], tracks[0]["id"], formats[0]["id"]),
    )
    assert draft.status_code == 201, draft.text

    _login(client, "owner-delete@example.com")
    refused = client.delete(f"/api/v1/forms/{active_form['id']}")
    assert refused.status_code == 409
    assert "Close it instead" in refused.json()["detail"]


def test_form_can_select_submission_confirmation_template(client):
    _login(client, "owner-template@example.com")
    event = _create_event_with_program(client)
    templates = client.get(f"/api/v1/events/{event['id']}/email-templates").json()
    confirmation = next(template for template in templates if template["type"] == "submission_received")
    payload = _form_payload(client, event["id"])
    payload["confirmation_template_id"] = confirmation["id"]

    form = client.post(f"/api/v1/events/{event['id']}/forms", json=payload)
    assert form.status_code == 201, form.text
    assert form.json()["confirmation_template_id"] == confirmation["id"]


def test_full_public_submission_flow(client):
    _login(client, "owner@example.com")
    event = _create_event_with_program(client)
    form = client.post(f"/api/v1/events/{event['id']}/forms", json=_form_payload(client, event["id"]))
    form_id = form.json()["id"]
    client.post(f"/api/v1/forms/{form_id}/publish")

    tracks = client.get(f"/api/v1/events/{event['id']}/tracks").json()
    formats = client.get(f"/api/v1/events/{event['id']}/formats").json()
    tags = client.get(f"/api/v1/events/{event['id']}/tags").json()
    agents = next(t for t in tracks if t["name"] == "AI Agents")
    talk = next(f for f in formats if f["name"] == "Talk")
    agents_tag = next(t for t in tags if t["name"] == "agents")

    # submitter signs in through the public flow
    code = client.post(
        f"/api/v1/public/forms/{event['slug']}/ai-agent-cfp/auth/request-code",
        json={"email": "submitter@example.com"},
    ).json()["dev_code"]
    client.post(
        f"/api/v1/public/forms/{event['slug']}/ai-agent-cfp/auth/verify",
        json={"email": "submitter@example.com", "code": code},
    )

    # draft -> edit -> submit
    payload = _submission_payload(event["id"], agents["id"], talk["id"])
    draft = client.post(f"/api/v1/public/forms/{event['slug']}/ai-agent-cfp/submissions", json=payload)
    assert draft.status_code == 201, draft.text
    submission_id = draft.json()["id"]
    assert draft.json()["status"] == "draft"

    updated = client.patch(
        f"/api/v1/public/submissions/{submission_id}",
        json={**payload, "description": "Updated abstract."},
    )
    assert updated.status_code == 200

    submitted = client.post(
        f"/api/v1/public/submissions/{submission_id}/submit", json={**payload, "description": "Updated abstract."}
    )
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["status"] == "submitted"

    # routing applied the tag for AI Agents track
    _login(client, "owner@example.com")
    detail = client.get(f"/api/v1/submissions/{submission_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["status"] == "submitted"
    assert agents_tag["id"] in body["tags"]
    assert body["track_id"] == agents["id"]
    assert len(body["participants"]) == 1
    assert body["participants"][0]["email"] == "speaker@example.com"
    assert body["participants"][0]["role"] == "speaker"

    # organizer sees it in the list
    listed = client.get(f"/api/v1/events/{event['id']}/submissions")
    assert listed.status_code == 200
    assert any(s["id"] == submission_id for s in listed.json())


def test_conditional_rule_enforced_server_side(client):
    _login(client, "owner@example.com")
    event = _create_event_with_program(client)
    form = client.post(f"/api/v1/events/{event['id']}/forms", json=_form_payload(client, event["id"]))
    form_id = form.json()["id"]
    client.post(f"/api/v1/forms/{form_id}/publish")

    formats = client.get(f"/api/v1/events/{event['id']}/formats").json()
    tracks = client.get(f"/api/v1/events/{event['id']}/tracks").json()
    workshop = next(f for f in formats if f["name"] == "Workshop")
    agents = next(t for t in tracks if t["name"] == "AI Agents")

    _login(client, "speaker2@example.com")

    # Workshop format triggers the "workshop_duration is required" rule — missing it fails
    draft = client.post(
        f"/api/v1/public/forms/{event['slug']}/ai-agent-cfp/submissions",
        json=_submission_payload(event["id"], agents["id"], workshop["id"]),
    )
    submission_id = draft.json()["id"]
    res = client.post(
        f"/api/v1/public/submissions/{submission_id}/submit",
        json=_submission_payload(event["id"], agents["id"], workshop["id"]),
    )
    assert res.status_code == 400
    assert "Workshop duration (min) is required" in " ".join(res.json()["detail"])

    # providing it succeeds
    ok = client.post(
        f"/api/v1/public/submissions/{submission_id}/submit",
        json=_submission_payload(event["id"], agents["id"], workshop["id"], workshop_duration=90),
    )
    assert ok.status_code == 200


def test_missing_required_field_rejected(client):
    _login(client, "owner@example.com")
    event = _create_event_with_program(client)
    form = client.post(f"/api/v1/events/{event['id']}/forms", json=_form_payload(client, event["id"]))
    form_id = form.json()["id"]
    client.post(f"/api/v1/forms/{form_id}/publish")

    formats = client.get(f"/api/v1/events/{event['id']}/formats").json()
    tracks = client.get(f"/api/v1/events/{event['id']}/tracks").json()
    talk = next(f for f in formats if f["name"] == "Talk")
    agents = next(t for t in tracks if t["name"] == "AI Agents")

    _login(client, "speaker3@example.com")
    # invalid dropdown option
    draft = client.post(
        f"/api/v1/public/forms/{event['slug']}/ai-agent-cfp/submissions",
        json=_submission_payload(event["id"], agents["id"], talk["id"], audience="Aliens"),
    )
    submission_id = draft.json()["id"]
    res = client.post(
        f"/api/v1/public/submissions/{submission_id}/submit",
        json=_submission_payload(event["id"], agents["id"], talk["id"], audience="Aliens"),
    )
    assert res.status_code == 400
    assert "must be one of" in " ".join(res.json()["detail"])


def test_closed_form_cannot_submit(client):
    _login(client, "owner@example.com")
    event = _create_event_with_program(client)
    form = client.post(f"/api/v1/events/{event['id']}/forms", json=_form_payload(client, event["id"]))
    form_id = form.json()["id"]
    client.post(f"/api/v1/forms/{form_id}/close")

    tracks = client.get(f"/api/v1/events/{event['id']}/tracks").json()
    formats = client.get(f"/api/v1/events/{event['id']}/formats").json()
    talk = next(f for f in formats if f["name"] == "Talk")
    agents = next(t for t in tracks if t["name"] == "AI Agents")

    _login(client, "speaker4@example.com")
    draft = client.post(
        f"/api/v1/public/forms/{event['slug']}/ai-agent-cfp/submissions",
        json=_submission_payload(event["id"], agents["id"], talk["id"]),
    )
    assert draft.status_code == 400  # closed

    # reopen (as owner) and submit
    _login(client, "owner@example.com")
    client.post(f"/api/v1/forms/{form_id}/publish")
    _login(client, "speaker4@example.com")
    draft = client.post(
        f"/api/v1/public/forms/{event['slug']}/ai-agent-cfp/submissions",
        json=_submission_payload(event["id"], agents["id"], talk["id"]),
    )
    submission_id = draft.json()["id"]
    res = client.post(
        f"/api/v1/public/submissions/{submission_id}/submit",
        json=_submission_payload(event["id"], agents["id"], talk["id"]),
    )
    assert res.status_code == 200


def test_submission_limit_enforced(client):
    _login(client, "owner@example.com")
    event = _create_event_with_program(client)
    payload = _form_payload(client, event["id"])
    payload["submission_limit"] = 1
    form = client.post(f"/api/v1/events/{event['id']}/forms", json=payload)
    form_id = form.json()["id"]
    client.post(f"/api/v1/forms/{form_id}/publish")

    tracks = client.get(f"/api/v1/events/{event['id']}/tracks").json()
    formats = client.get(f"/api/v1/events/{event['id']}/formats").json()
    talk = next(f for f in formats if f["name"] == "Talk")
    agents = next(t for t in tracks if t["name"] == "AI Agents")

    _login(client, "speaker5@example.com")
    base = _submission_payload(event["id"], agents["id"], talk["id"])
    draft1 = client.post(f"/api/v1/public/forms/{event['slug']}/ai-agent-cfp/submissions", json=base)
    assert client.post(f"/api/v1/public/submissions/{draft1.json()['id']}/submit", json=base).status_code == 200

    draft2 = client.post(f"/api/v1/public/forms/{event['slug']}/ai-agent-cfp/submissions", json=base)
    res = client.post(f"/api/v1/public/submissions/{draft2.json()['id']}/submit", json=base)
    assert res.status_code == 400
    assert "limit" in res.json()["detail"]


def test_submission_ownership_and_rbac(client):
    _login(client, "owner@example.com")
    event = _create_event_with_program(client)
    form = client.post(f"/api/v1/events/{event['id']}/forms", json=_form_payload(client, event["id"]))
    form_id = form.json()["id"]
    client.post(f"/api/v1/forms/{form_id}/publish")

    tracks = client.get(f"/api/v1/events/{event['id']}/tracks").json()
    formats = client.get(f"/api/v1/events/{event['id']}/formats").json()
    talk = next(f for f in formats if f["name"] == "Talk")
    agents = next(t for t in tracks if t["name"] == "AI Agents")

    code = client.post(
        f"/api/v1/public/forms/{event['slug']}/ai-agent-cfp/auth/request-code",
        json={"email": "alice@example.com"},
    ).json()["dev_code"]
    client.post(
        f"/api/v1/public/forms/{event['slug']}/ai-agent-cfp/auth/verify",
        json={"email": "alice@example.com", "code": code},
    )
    draft = client.post(
        f"/api/v1/public/forms/{event['slug']}/ai-agent-cfp/submissions",
        json=_submission_payload(event["id"], agents["id"], talk["id"]),
    )
    submission_id = draft.json()["id"]

    # a different submitter cannot edit someone else's submission
    code = client.post(
        f"/api/v1/public/forms/{event['slug']}/ai-agent-cfp/auth/request-code",
        json={"email": "mallory@example.com"},
    ).json()["dev_code"]
    client.post(
        f"/api/v1/public/forms/{event['slug']}/ai-agent-cfp/auth/verify",
        json={"email": "mallory@example.com", "code": code},
    )
    res = client.patch(
        f"/api/v1/public/submissions/{submission_id}", json=_submission_payload(event["id"], agents["id"], talk["id"])
    )
    assert res.status_code == 403

    # a stranger with no event role cannot see organizer forms
    stranger_code = client.post("/api/v1/auth/request-code", json={"email": "stranger@example.com"}).json()["dev_code"]
    client.post("/api/v1/auth/verify", json={"email": "stranger@example.com", "code": stranger_code})
    assert client.get(f"/api/v1/events/{event['id']}/forms").status_code == 403
