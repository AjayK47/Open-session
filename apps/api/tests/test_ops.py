import os
import tempfile

import pytest
from fastapi.testclient import TestClient

_temp_db = os.path.join(tempfile.gettempdir(), "open_session_ops_test.db")
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


def _login(client: TestClient, email: str, first_name: str | None = None, last_name: str | None = None) -> None:
    code = client.post("/api/v1/auth/request-code", json={"email": email}).json()["dev_code"]
    client.post(
        "/api/v1/auth/verify",
        json={"email": email, "code": code, "first_name": first_name, "last_name": last_name},
    )


def _event(client: TestClient, slug: str | None = None) -> dict:
    import uuid

    slug = slug or f"ops-{uuid.uuid4().hex[:8]}"
    res = client.post(
        "/api/v1/events",
        json={
            "name": "Ops Conf 2026",
            "slug": slug,
            "type": "conference",
            "timezone": "UTC",
            "starts_at": "2026-11-10T09:00:00Z",
            "ends_at": "2026-11-12T18:00:00Z",
            "program": {
                "tracks": [{"name": "AI Agents", "serial_schedule": False}, {"name": "Keynotes"}],
                "rooms": [{"name": "Room A", "capacity": 300}, {"name": "Room B"}],
                "formats": [
                    {"name": "Talk", "default_duration_minutes": 45},
                    {"name": "Workshop", "default_duration_minutes": 90},
                ],
                "tags": [{"name": "agents"}],
            },
        },
    )
    assert res.status_code == 201
    return res.json()


def _form(client: TestClient, event_id: str, slug: str = "cfp") -> dict:
    tracks = client.get(f"/api/v1/events/{event_id}/tracks").json()
    formats = client.get(f"/api/v1/events/{event_id}/formats").json()
    agents = next(t for t in tracks if t["name"] == "AI Agents")
    talk = next(f for f in formats if f["name"] == "Talk")
    res = client.post(
        f"/api/v1/events/{event_id}/forms",
        json={
            "internal_name": "CFP",
            "public_title": "Call for Speakers",
            "slug": slug,
            "sections": [
                {
                    "key": "p",
                    "title": "Proposal",
                    "fields": [
                        {
                            "key": "title",
                            "label": "Title",
                            "field_type": "system",
                            "system_field": "title",
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
                    ],
                }
            ],
            "routing_rules": [
                {
                    "trigger": {"field": "track", "operator": "equals", "value": agents["id"]},
                    "actions": [{"kind": "assign_track", "value": agents["id"]}],
                }
            ],
            "close_at": "2026-12-31T00:00:00Z",
        },
    )
    form_id = res.json()["id"]
    client.post(f"/api/v1/forms/{form_id}/publish")
    return {"id": form_id, "track": agents["id"], "format": talk["id"]}


def _submit(client: TestClient, event: dict, form: dict) -> str:
    code = client.post(
        f"/api/v1/public/forms/{event['slug']}/cfp/auth/request-code", json={"email": "speaker@ops.io"}
    ).json()["dev_code"]
    client.post(f"/api/v1/public/forms/{event['slug']}/cfp/auth/verify", json={"email": "speaker@ops.io", "code": code})
    payload = {
        "title": "Building Production Agents",
        "track_id": form["track"],
        "format_id": form["format"],
        "participants": [{"email": "speaker@ops.io", "role": "speaker", "first_name": "Ada", "last_name": "Lovelace"}],
    }
    draft = client.post(f"/api/v1/public/forms/{event['slug']}/cfp/submissions", json=payload)
    submission_id = draft.json()["id"]
    res = client.post(f"/api/v1/public/submissions/{submission_id}/submit", json=payload)
    assert res.status_code == 200
    return submission_id


# --- Phase 3: decisions + acceptance flow --------------------------------------


def test_accept_flow_creates_session_speakers_and_tasks(client):
    _login(client, "owner@ops.io")
    event = _event(client)
    form = _form(client, event["id"])
    submission_id = _submit(client, event, form)

    _login(client, "owner@ops.io")
    # create a task template that applies to accepted speakers
    client.post(
        f"/api/v1/events/{event['id']}/task-templates",
        json={
            "name": "Upload headshot",
            "task_type": "file_upload",
            "required": True,
            "due_rule": {"offset_days": 7},
            "applies_when": {"speaker_status": "accepted"},
        },
    )

    res = client.post(f"/api/v1/submissions/{submission_id}/decision", json={"decision": "accepted"})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "accepted"

    # session created from submission
    sessions = client.get(f"/api/v1/events/{event['id']}/sessions").json()
    assert len(sessions) == 1
    assert sessions[0]["source_submission_id"] == submission_id
    assert sessions[0]["status"] == "confirmed"

    # speaker marked accepted
    speakers = client.get(f"/api/v1/events/{event['id']}/speakers").json()
    assert len(speakers) == 1
    assert speakers[0]["email"] == "speaker@ops.io"
    assert speakers[0]["speaker_status"] == "accepted"

    # task generated
    assignments = client.get(f"/api/v1/events/{event['id']}/task-assignments").json()
    assert any(a["name"] == "Upload headshot" for a in assignments)

    # acceptance email recorded
    comms = client.get(f"/api/v1/events/{event['id']}/communications").json()
    assert any(c["related_submission_id"] == submission_id for c in comms)


def test_decision_state_machine_and_decline(client):
    _login(client, "owner2@ops.io")
    event = _event(client)
    form = _form(client, event["id"])
    submission_id = _submit(client, event, form)

    _login(client, "owner2@ops.io")
    # invalid transition (declined -> accepted directly is allowed; but withdrawn -> anything is not)
    res = client.post(f"/api/v1/submissions/{submission_id}/decision", json={"decision": "withdrawn"})
    assert res.status_code == 200
    res = client.post(f"/api/v1/submissions/{submission_id}/decision", json={"decision": "accepted"})
    assert res.status_code == 409  # withdrawn has no allowed transitions

    sub2 = _submit(client, event, form)
    _login(client, "owner2@ops.io")
    res = client.post(f"/api/v1/submissions/{sub2}/decision", json={"decision": "declined", "notify": False})
    assert res.status_code == 200
    assert res.json()["status"] == "declined"


def test_manual_submission_create_and_csv_export(client):
    _login(client, "owner3@ops.io")
    event = _event(client)
    tracks = client.get(f"/api/v1/events/{event['id']}/tracks").json()
    res = client.post(
        f"/api/v1/events/{event['id']}/submissions",
        json={
            "title": "Manual session",
            "track_id": tracks[0]["id"],
            "tags": ["agents"],
            "participants": [{"email": "someone@ops.io", "role": "speaker", "first_name": "Sam"}],
        },
    )
    assert res.status_code == 201
    sub_id = res.json()["id"]

    csv = client.get(f"/api/v1/events/{event['id']}/submissions/export.csv")
    assert csv.status_code == 200
    assert "Manual session" in csv.text
    assert "someone@ops.io" in csv.text

    detail = client.get(f"/api/v1/submissions/{sub_id}")
    assert detail.json()["participants"][0]["email"] == "someone@ops.io"


# --- Phase 4: evaluations -------------------------------------------------------


def test_evaluation_workflow(client):
    _login(client, "owner4@ops.io")
    event = _event(client)
    form = _form(client, event["id"])
    sub_a = _submit(client, event, form)
    _login(client, "owner4@ops.io")
    sub_b = client.post(
        f"/api/v1/events/{event['id']}/submissions",
        json={"title": "Second", "participants": [{"email": "s2@ops.io", "role": "speaker"}]},
    ).json()["id"]
    sub_unassigned = client.post(
        f"/api/v1/events/{event['id']}/submissions",
        json={"title": "Not assigned", "participants": [{"email": "s3@ops.io", "role": "speaker"}]},
    ).json()["id"]

    # create plan
    plan = client.post(
        f"/api/v1/events/{event['id']}/evaluation-plans",
        json={
            "name": "AI Committee",
            "scope": {"track_ids": [form["track"]]},
            "criteria": [
                {"key": "novelty", "label": "Novelty", "type": "numeric", "scale_max": 5, "weight": 2},
                {"key": "relevance", "label": "Relevance", "type": "numeric", "scale_max": 5, "weight": 1},
            ],
            "reviews_required": 2,
            "blind_review": True,
        },
    )
    assert plan.status_code == 201
    plan_id = plan.json()["id"]

    # add reviewer to team
    client.post(f"/api/v1/events/{event['id']}/team", json={"email": "reviewer@ops.io", "role": "reviewer"})

    assigned = client.post(
        f"/api/v1/evaluation-plans/{plan_id}/assignments",
        json={"reviewers": ["reviewer@ops.io"], "submission_ids": [sub_a, sub_b]},
    )
    assert assigned.status_code == 200
    assert assigned.json()["assigned"] == 2

    # The same reviewer may review the same proposal again in a later round;
    # idempotency is scoped to the plan, not globally to reviewer/submission.
    round_two = client.post(
        f"/api/v1/events/{event['id']}/evaluation-plans",
        json={"name": "Final round", "round_number": 2, "criteria": [{"key": "fit", "label": "Fit"}]},
    ).json()
    second_round_assignment = client.post(
        f"/api/v1/evaluation-plans/{round_two['id']}/assignments",
        json={"reviewers": ["reviewer@ops.io"], "submission_ids": [sub_a]},
    )
    assert second_round_assignment.status_code == 200
    assert second_round_assignment.json()["assigned"] == 1

    # reviewer signs in and sees assignments
    code = client.post("/api/v1/auth/request-code", json={"email": "reviewer@ops.io"}).json()["dev_code"]
    client.post("/api/v1/auth/verify", json={"email": "reviewer@ops.io", "code": code})
    assignments = client.get("/api/v1/reviewer/assignments").json()
    assert len(assignments) == 3
    assignment_id = next(
        a["id"] for a in assignments if a["submission_id"] == sub_a and a["plan_id"] == plan_id
    )

    # The scorecard is available to assigned reviewers, while IDs outside their
    # assignment set cannot be enumerated or mutated.
    assert client.get(f"/api/v1/evaluation-plans/{plan_id}").status_code == 200
    assert client.get(f"/api/v1/submissions/{sub_unassigned}").status_code == 404
    assert client.patch(f"/api/v1/submissions/{sub_a}", json={"title": "Reviewer edit"}).status_code == 403

    # blind_review=True on the plan: the reviewer must not see speaker identity/company
    reviewer_view = client.get(f"/api/v1/submissions/{sub_a}").json()
    assert reviewer_view["submitter_person_id"] is None
    assert reviewer_view["participants"], "expected participants on the submission"
    for p in reviewer_view["participants"]:
        assert p["email"].endswith("@blind-review.invalid")
        assert p["company"] is None
        assert p["job_title"] is None
        assert p["bio"] is None

    # save draft then submit
    res = client.post(
        f"/api/v1/review-assignments/{assignment_id}/review",
        json={"scores": {"novelty": 5, "relevance": 4}, "comments": "Strong", "submit": False},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "in_progress"
    saved_assignment = next(
        item for item in client.get("/api/v1/reviewer/assignments").json() if item["id"] == assignment_id
    )
    assert saved_assignment["scores"] == {"novelty": 5, "relevance": 4}
    assert saved_assignment["comments"] == "Strong"

    res = client.post(
        f"/api/v1/review-assignments/{assignment_id}/review",
        json={"scores": {"novelty": 5, "relevance": 4}, "comments": "Strong", "submit": True},
    )
    assert res.json()["status"] == "completed"
    assert res.json()["weighted_score"] == pytest.approx(4.6667, abs=0.01)  # (5*2+4*1)/3

    # aggregate on submission; the owner is never subject to blind-review redaction
    _login(client, "owner4@ops.io")
    detail = client.get(f"/api/v1/submissions/{sub_a}").json()
    assert detail["aggregate_rating"] == pytest.approx(4.67, abs=0.01)
    assert detail["review_summary"]["completed"] == 1
    assert detail["review_summary"]["total"] == 2
    assert detail["submitter_person_id"] is not None
    assert not any(p["email"].endswith("@blind-review.invalid") for p in detail["participants"])


# --- Phase 5: tasks, onboarding dashboard, files ---------------------------------


def test_task_completion_updates_onboarding_dashboard(client):
    _login(client, "owner5@ops.io")
    event = _event(client)
    form = _form(client, event["id"])
    sub = _submit(client, event, form)
    _login(client, "owner5@ops.io")
    client.post(
        f"/api/v1/events/{event['id']}/task-templates",
        json={"name": "Upload headshot", "task_type": "file_upload", "due_rule": {"offset_days": 7}},
    )
    client.post(f"/api/v1/submissions/{sub}/decision", json={"decision": "accepted"})

    assignment = client.get(f"/api/v1/events/{event['id']}/task-assignments").json()[0]

    # speaker completes task via portal
    code = client.post("/api/v1/auth/request-code", json={"email": "speaker@ops.io"}).json()["dev_code"]
    client.post("/api/v1/auth/verify", json={"email": "speaker@ops.io", "code": code})
    res = client.post(f"/api/v1/me/tasks/{assignment['id']}/complete", json={"completion_data": {"note": "done"}})
    assert res.status_code == 200

    # organizer dashboard reflects completion
    _login(client, "owner5@ops.io")
    dashboard = client.get(f"/api/v1/events/{event['id']}/onboarding").json()
    assert dashboard["total_accepted_speakers"] == 1
    assert dashboard["fully_ready"] == 1
    assert dashboard["outstanding"] == 0

    metrics = client.get(f"/api/v1/events/{event['id']}/metrics").json()
    assert metrics["accepted_submissions"] == 1
    assert metrics["accepted_speakers"] == 1


def test_file_upload_download_delete(client):
    _login(client, "owner6@ops.io")
    event = _event(client)
    intent = client.post(
        f"/api/v1/events/{event['id']}/files/upload-intent",
        json={"filename": "avatar.png", "content_type": "image/png", "size_bytes": 42, "file_type": "headshot"},
    )
    assert intent.status_code == 200
    file_id = intent.json()["id"]

    content = client.post(f"/api/v1/files/{file_id}/content", content=b"\x89PNG fake bytes")
    assert content.status_code == 200

    download = client.get(f"/api/v1/files/{file_id}/download")
    assert download.status_code == 200
    assert download.content == b"\x89PNG fake bytes"

    listed = client.get(f"/api/v1/events/{event['id']}/files").json()
    assert any(f["id"] == file_id and f["file_type"] == "headshot" for f in listed)

    deleted = client.delete(f"/api/v1/files/{file_id}")
    assert deleted.status_code == 200
    assert client.get(f"/api/v1/events/{event['id']}/files").json() == []


def test_file_upload_rejects_disallowed_type_for_headshot(client):
    _login(client, "owner6b@ops.io")
    event = _event(client)

    # wrong extension for the declared file_type
    res = client.post(
        f"/api/v1/events/{event['id']}/files/upload-intent",
        json={"filename": "malware.exe", "content_type": "image/png", "size_bytes": 42, "file_type": "headshot"},
    )
    assert res.status_code == 400

    # extension/content_type mismatch that lies about being an image
    res = client.post(
        f"/api/v1/events/{event['id']}/files/upload-intent",
        json={
            "filename": "avatar.png",
            "content_type": "application/x-msdownload",
            "size_bytes": 42,
            "file_type": "headshot",
        },
    )
    assert res.status_code == 400

    # a PDF is fine for slides, but not for a headshot
    res = client.post(
        f"/api/v1/events/{event['id']}/files/upload-intent",
        json={"filename": "deck.pdf", "content_type": "application/pdf", "size_bytes": 42, "file_type": "slides"},
    )
    assert res.status_code == 200


def test_reminder_job(client):
    _login(client, "owner7@ops.io")
    event = _event(client)
    form = _form(client, event["id"])
    sub = _submit(client, event, form)
    _login(client, "owner7@ops.io")
    client.post(
        f"/api/v1/events/{event['id']}/task-templates",
        json={"name": "Confirm attendance", "task_type": "confirmation", "due_rule": {"offset_days": -1}},
    )
    client.post(f"/api/v1/submissions/{sub}/decision", json={"decision": "accepted"})

    res = client.post("/internal/reminders/run")
    assert res.status_code == 200
    assert res.json()["reminders_sent"] == 1
    # dedupe on second run
    assert client.post("/internal/reminders/run").json()["reminders_sent"] == 0


# --- Phase 6: communications ------------------------------------------------------


def test_communication_templates_and_history(client):
    _login(client, "owner8@ops.io")
    event = _event(client)
    templates = client.get(f"/api/v1/events/{event['id']}/email-templates").json()
    types = {t["type"] for t in templates}
    assert {"submission_received", "submission_accepted", "submission_declined", "session_scheduled"} <= types

    automation = client.post(
        f"/api/v1/events/{event['id']}/automations",
        json={"trigger_type": "session_scheduled", "include_calendar_invite": True, "template_id": templates[0]["id"]},
    )
    assert automation.status_code == 201

    manual = client.post(
        f"/api/v1/events/{event['id']}/communications/send",
        json={"subject": "Hello", "html": "<p>Hi</p>", "recipients": ["a@b.com", "c@d.com"]},
    )
    assert manual.status_code == 200
    assert manual.json()["sent"] == 2
    history = client.get(f"/api/v1/events/{event['id']}/communications").json()
    assert len(history) >= 2


def test_manual_bulk_email_preview_matches_personalized_send(client, monkeypatch):
    captured = []

    def fake_send_email(message):
        captured.append(message)
        return f"message-{len(captured)}"

    monkeypatch.setattr("app.services.communication_service.send_email", fake_send_email)
    _login(client, "personal-owner@ops.io")
    event = _event(client)
    client.post(
        f"/api/v1/events/{event['id']}/speakers",
        json={"email": "priya@ops.io", "first_name": "Priya", "last_name": "Raman"},
    )
    client.post(
        f"/api/v1/events/{event['id']}/speakers",
        json={"email": "marcus@ops.io", "first_name": "Marcus", "last_name": "Okafor"},
    )
    payload = {
        "subject": "Welcome {{speaker.first_name}} to {{event.name}}",
        "html": "<p>Hello {{speaker.name}} — open {{portal_url}}</p>",
        "recipients": ["priya@ops.io", "marcus@ops.io"],
    }
    preview = client.post(f"/api/v1/events/{event['id']}/communications/preview", json=payload)
    assert preview.status_code == 200, preview.text
    assert preview.json()["recipient_name"] == "Priya Raman"
    assert preview.json()["subject"] == "Welcome Priya to Ops Conf 2026"
    assert "Hello Priya Raman" in preview.json()["html"]

    sent = client.post(f"/api/v1/events/{event['id']}/communications/send", json=payload)
    assert sent.json() == {"sent": 2}
    assert [message.subject for message in captured] == [
        "Welcome Priya to Ops Conf 2026",
        "Welcome Marcus to Ops Conf 2026",
    ]
    history = client.get(f"/api/v1/events/{event['id']}/communications").json()
    assert all(item["recipient_person_id"] for item in history)


# --- Phase 7: sessions / agenda / conflicts ----------------------------------------


def test_schedule_email_carries_ics_attachment(client, monkeypatch):
    captured = []

    def fake_send_email(message):
        captured.append(message)
        return "fake-message-id@local"

    monkeypatch.setattr("app.services.communication_service.send_email", fake_send_email)

    _login(client, "ics-owner@ops.io")
    event = _event(client)
    rooms = client.get(f"/api/v1/events/{event['id']}/rooms").json()
    formats = client.get(f"/api/v1/events/{event['id']}/formats").json()

    session = client.post(
        f"/api/v1/events/{event['id']}/sessions",
        json={
            "title": "Attach Me",
            "format_id": formats[0]["id"],
            "participants": [{"email": "ics-speaker@ops.io", "role": "speaker", "first_name": "S"}],
        },
    ).json()

    res = client.patch(
        f"/api/v1/sessions/{session['id']}/schedule",
        json={"room_id": rooms[0]["id"], "starts_at": "2026-11-11T09:00:00Z", "ends_at": "2026-11-11T09:45:00Z"},
    )
    assert res.status_code == 200

    invite_emails = [m for m in captured if m.to == "ics-speaker@ops.io"]
    assert invite_emails, "expected a calendar invite email to the speaker"
    assert invite_emails[0].attachments, "calendar invite email must carry the ICS attachment"
    assert invite_emails[0].attachments[0].content_type.startswith("text/calendar")
    assert invite_emails[0].attachments[0].filename == "invite.ics"


def test_agenda_scheduling_and_conflicts(client):
    _login(client, "owner9@ops.io")
    event = _event(client)
    rooms = client.get(f"/api/v1/events/{event['id']}/rooms").json()
    formats = client.get(f"/api/v1/events/{event['id']}/formats").json()
    room_a, room_b = rooms[0]["id"], rooms[1]["id"]
    talk = formats[0]["id"]

    s1 = client.post(
        f"/api/v1/events/{event['id']}/sessions",
        json={
            "title": "S1",
            "format_id": talk,
            "participants": [{"email": "host@ops.io", "role": "speaker", "first_name": "H"}],
        },
    ).json()
    s2 = client.post(
        f"/api/v1/events/{event['id']}/sessions",
        json={
            "title": "S2",
            "format_id": talk,
            "participants": [{"email": "host@ops.io", "role": "speaker", "first_name": "H"}],
        },
    ).json()

    # schedule s1
    res = client.patch(
        f"/api/v1/sessions/{s1['id']}/schedule",
        json={"room_id": room_a, "starts_at": "2026-11-10T10:00:00Z", "ends_at": "2026-11-10T10:45:00Z"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "scheduled"

    # s2 overlaps in the same room AND with the same speaker -> hard conflict, blocked
    res = client.patch(
        f"/api/v1/sessions/{s2['id']}/schedule",
        json={"room_id": room_a, "starts_at": "2026-11-10T10:15:00Z", "ends_at": "2026-11-10T11:00:00Z"},
    )
    assert res.status_code == 409
    assert "conflict" in res.json()["detail"]

    # hard conflicts (room/speaker collisions) are never overridable, even with allow_soft
    res = client.patch(
        f"/api/v1/sessions/{s2['id']}/schedule",
        json={
            "room_id": room_a,
            "starts_at": "2026-11-10T10:15:00Z",
            "ends_at": "2026-11-10T11:00:00Z",
            "allow_soft": True,
        },
    )
    assert res.status_code == 409

    # a different room at a non-overlapping time (still the same speaker) has no conflict at all
    res = client.patch(
        f"/api/v1/sessions/{s2['id']}/schedule",
        json={"room_id": room_b, "starts_at": "2026-11-10T11:00:00Z", "ends_at": "2026-11-10T11:45:00Z"},
    )
    assert res.status_code == 200

    agenda = client.get(f"/api/v1/events/{event['id']}/agenda").json()
    assert len(agenda) == 2

    conflicts = client.get(f"/api/v1/events/{event['id']}/conflicts").json()
    kinds = {c["kind"] for c in conflicts}
    assert "room_collision" not in kinds and "speaker_collision" not in kinds

    # event boundary violation is also a hard conflict: allow_soft cannot save it either
    res = client.patch(
        f"/api/v1/sessions/{s1['id']}/schedule",
        json={
            "room_id": room_a,
            "starts_at": "2025-01-01T00:00:00Z",
            "ends_at": "2025-01-01T00:45:00Z",
            "allow_soft": True,
        },
    )
    assert res.status_code == 409
    conflicts = client.get(f"/api/v1/events/{event['id']}/conflicts").json()
    assert not any(c["kind"] == "event_boundary" for c in conflicts)


def test_soft_track_conflict_blocks_by_default_but_allow_soft_overrides(client):
    _login(client, "owner10@ops.io")
    event = _event(client)
    rooms = client.get(f"/api/v1/events/{event['id']}/rooms").json()
    formats = client.get(f"/api/v1/events/{event['id']}/formats").json()
    tracks = client.get(f"/api/v1/events/{event['id']}/tracks").json()
    agents_track = next(t for t in tracks if t["name"] == "AI Agents")

    # mark the track as serial so overlapping sessions in it are a (soft) conflict
    res = client.patch(
        f"/api/v1/events/{event['id']}/tracks/{agents_track['id']}",
        json={"serial_schedule": True},
    )
    assert res.status_code == 200

    s1 = client.post(
        f"/api/v1/events/{event['id']}/sessions",
        json={
            "title": "Track S1",
            "format_id": formats[0]["id"],
            "track_id": agents_track["id"],
            "participants": [{"email": "speaker1@ops.io", "role": "speaker", "first_name": "One"}],
        },
    ).json()
    s2 = client.post(
        f"/api/v1/events/{event['id']}/sessions",
        json={
            "title": "Track S2",
            "format_id": formats[0]["id"],
            "track_id": agents_track["id"],
            "participants": [{"email": "speaker2@ops.io", "role": "speaker", "first_name": "Two"}],
        },
    ).json()

    res = client.patch(
        f"/api/v1/sessions/{s1['id']}/schedule",
        json={"room_id": rooms[0]["id"], "starts_at": "2026-11-10T10:00:00Z", "ends_at": "2026-11-10T10:45:00Z"},
    )
    assert res.status_code == 200

    # different room, different speaker, overlapping time, same serial track -> soft conflict only
    res = client.patch(
        f"/api/v1/sessions/{s2['id']}/schedule",
        json={"room_id": rooms[1]["id"], "starts_at": "2026-11-10T10:15:00Z", "ends_at": "2026-11-10T11:00:00Z"},
    )
    assert res.status_code == 409

    res = client.patch(
        f"/api/v1/sessions/{s2['id']}/schedule",
        json={
            "room_id": rooms[1]["id"],
            "starts_at": "2026-11-10T10:15:00Z",
            "ends_at": "2026-11-10T11:00:00Z",
            "allow_soft": True,
        },
    )
    assert res.status_code == 200

    conflicts = client.get(f"/api/v1/events/{event['id']}/conflicts").json()
    kinds = {c["kind"] for c in conflicts}
    assert "track_collision" in kinds
    assert "room_collision" not in kinds and "speaker_collision" not in kinds


# --- Phase 8: team, saved views, api keys ------------------------------------------


def test_team_and_saved_views(client):
    _login(client, "owner10@ops.io")
    event = _event(client)
    res = client.post(f"/api/v1/events/{event['id']}/team", json={"email": "helper@ops.io", "role": "admin"})
    assert res.status_code == 201
    team = client.get(f"/api/v1/events/{event['id']}/team").json()
    assert any(m["email"] == "helper@ops.io" and m["role"] == "admin" for m in team)

    view = client.post(
        f"/api/v1/events/{event['id']}/saved-views",
        json={
            "resource_type": "submissions",
            "name": "Pending",
            "filters": {"status": "submitted"},
            "columns": ["title", "status"],
        },
    )
    assert view.status_code == 201
    views = client.get(f"/api/v1/events/{event['id']}/saved-views").json()
    assert len(views) == 1

    patched = client.patch(f"/api/v1/saved-views/{view.json()['id']}", json={"name": "Pending 2"})
    assert patched.json()["name"] == "Pending 2"

    assert client.delete(f"/api/v1/saved-views/{view.json()['id']}").status_code == 200


def test_api_keys_rbac(client):
    _login(client, "owner11@ops.io")
    event = _event(client)
    res = client.post(
        f"/api/v1/events/{event['id']}/api-keys",
        json={"name": "CI", "scopes": ["events:read", "sessions:write"]},
    )
    assert res.status_code == 201
    api_key = res.json()["key"]

    # use a cookie-less client so only the bearer token authenticates
    key_client = TestClient(app)
    headers = {"Authorization": f"Bearer {api_key}"}

    r = key_client.get("/api/v1/events", headers=headers)
    assert r.status_code == 200
    assert r.json()[0]["id"] == event["id"]

    r = key_client.get("/api/v1/keys/validate", headers=headers)
    assert r.status_code == 200
    assert "sessions:write" in r.json()["scopes"]

    # key with events:read + sessions:write cannot write event config (needs events:write)
    r = key_client.post(
        f"/api/v1/events/{event['id']}/tracks",
        json={"name": "Hack"},
        headers=headers,
    )
    assert r.status_code == 403

    # bad key rejected
    r = key_client.get("/api/v1/events", headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401


def test_organizer_speaker_operations_and_assigned_file_request_isolation(client):
    _login(client, "speaker-ops-owner@example.com")
    event = _event(client)
    first = client.post(
        f"/api/v1/events/{event['id']}/speakers",
        json={
            "email": "speaker-one@example.com",
            "first_name": "One",
            "last_name": "Speaker",
            "speaker_status": "invited",
            "bio": "Original bio",
            "custom_fields": {"dietary_requirements": "Vegetarian"},
        },
    )
    second = client.post(
        f"/api/v1/events/{event['id']}/speakers",
        json={"email": "speaker-two@example.com", "first_name": "Two", "speaker_status": "accepted"},
    )
    assert first.status_code == 201
    assert second.status_code == 201
    first_id, second_id = first.json()["person_id"], second.json()["person_id"]

    filtered = client.get(f"/api/v1/events/{event['id']}/speakers?speaker_status=invited")
    assert [speaker["person_id"] for speaker in filtered.json()] == [first_id]
    updated = client.patch(
        f"/api/v1/events/{event['id']}/speakers/{first_id}",
        json={
            "bio": "Organizer edited bio",
            "confirmation_status": "confirmed",
            "custom_fields": {"travel_dates": "Nov 9–13"},
        },
    )
    assert updated.status_code == 200
    assert updated.json()["bio"] == "Organizer edited bio"
    assert updated.json()["custom_fields"]["travel_dates"] == "Nov 9–13"
    confirmed = client.get(f"/api/v1/events/{event['id']}/speakers?confirmation_status=confirmed")
    assert [speaker["person_id"] for speaker in confirmed.json()] == [first_id]

    invited = client.post(f"/api/v1/events/{event['id']}/speakers/{first_id}/invite")
    assert invited.status_code == 200 and invited.json()["sent"] == 1
    history = client.get(f"/api/v1/events/{event['id']}/communications").json()
    assert any(item["recipient_email"] == "speaker-one@example.com" for item in history)

    template = client.post(
        f"/api/v1/events/{event['id']}/task-templates",
        json={"name": "Send final slides", "instructions": "PDF or PPTX", "task_type": "file_upload"},
    ).json()
    assigned = client.post(
        f"/api/v1/events/{event['id']}/task-assignments/batch",
        json={"template_id": template["id"], "person_ids": [first_id, second_id], "due_at": "2026-11-01T23:59:00Z"},
    )
    assert assigned.status_code == 201 and assigned.json()["created"] == 2
    duplicate = client.post(
        f"/api/v1/events/{event['id']}/task-assignments/batch",
        json={"template_id": template["id"], "person_ids": [first_id]},
    )
    assert duplicate.status_code == 201 and duplicate.json()["created"] == 0

    request = client.post(
        f"/api/v1/events/{event['id']}/file-requests",
        json={
            "title": "Upload final deck",
            "instructions_html": "<p>Use the approved template.</p>",
            "assigned_person_ids": [second_id],
            "due_at": "2026-11-02T23:59:00Z",
            "accepted_extensions": ["pdf"],
            "max_size_mb": 5,
        },
    )
    assert request.status_code == 201
    request_id = request.json()["id"]
    reminded = client.post(
        f"/api/v1/events/{event['id']}/file-requests/remind",
        json={"items": [{"request_id": request_id, "person_id": second_id}]},
    )
    assert reminded.status_code == 200 and reminded.json() == {"sent": 1}
    history = client.get(f"/api/v1/events/{event['id']}/communications").json()
    assert any(item["recipient_email"] == "speaker-two@example.com" for item in history)

    _login(client, "speaker-one@example.com")
    assert all(item["id"] != request_id for item in client.get("/api/v1/me/file-requests").json())
    forbidden = client.post(
        f"/api/v1/me/file-requests/{request_id}/upload-intent",
        json={"filename": "deck.pdf", "content_type": "application/pdf", "size_bytes": 100, "file_type": "slides"},
    )
    assert forbidden.status_code == 403

    _login(client, "speaker-two@example.com")
    mine = client.get("/api/v1/me/file-requests").json()
    assert [item["id"] for item in mine] == [request_id]
