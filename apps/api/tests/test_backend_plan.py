import io
import os
import tempfile
import uuid
import zipfile

from fastapi.testclient import TestClient

# Point at a throwaway file *before* importing the app. Without this the suite
# inherits the default `sqlite:///./open_session.db` and runs against whatever
# development database happens to be sitting in apps/api — which is how a plain
# `pytest` run silently overwrote local seed data.
_temp_db = os.path.join(tempfile.gettempdir(), "open_session_backend_plan_test.db")
if os.path.exists(_temp_db):
    os.remove(_temp_db)
os.environ["OPEN_SESSION_DATABASE_URL"] = f"sqlite:///{_temp_db}"
os.environ["OPEN_SESSION_RATE_LIMIT_ENABLED"] = "false"

from app.main import app  # noqa: E402
from app.services.submission_service import _organizer_message_html  # noqa: E402


def _login(client: TestClient, email: str) -> None:
    code = client.post("/api/v1/auth/request-code", json={"email": email}).json()["dev_code"]
    response = client.post("/api/v1/auth/verify", json={"email": email, "code": code})
    assert response.status_code == 200, response.text


def _event(client: TestClient) -> dict:
    slug = f"backend-plan-{uuid.uuid4().hex[:8]}"
    response = client.post(
        "/api/v1/events",
        json={
            "name": "Backend Plan Event",
            "slug": slug,
            "type": "conference",
            "timezone": "UTC",
            "starts_at": "2026-11-10T09:00:00Z",
            "ends_at": "2026-11-12T18:00:00Z",
            "program": {
                "tracks": [{"name": "Agents"}],
                "rooms": [{"name": "Main"}],
                "formats": [{"name": "Talk", "default_duration_minutes": 45}],
                "tags": [{"name": "agents"}],
            },
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _cfp(client: TestClient, event: dict) -> dict:
    track = client.get(f"/api/v1/events/{event['id']}/tracks").json()[0]
    fmt = client.get(f"/api/v1/events/{event['id']}/formats").json()[0]
    response = client.post(
        f"/api/v1/events/{event['id']}/forms",
        json={
            "internal_name": "Backend plan CFP",
            "public_title": "Call for Speakers",
            "slug": "cfp",
            "sections": [
                {
                    "key": "proposal",
                    "title": "Proposal",
                    "fields": [
                        {
                            "key": "title",
                            "label": "Title",
                            "field_type": "system",
                            "system_field": "title",
                            "required": True,
                        }
                    ],
                }
            ],
            "close_at": "2026-12-31T23:59:59Z",
        },
    )
    assert response.status_code == 201, response.text
    form = response.json()
    assert client.post(f"/api/v1/forms/{form['id']}/publish").status_code == 200
    return {"form": form, "track_id": track["id"], "format_id": fmt["id"]}


def _submit(client: TestClient, event: dict, cfp: dict, email: str) -> str:
    code = client.post(f"/api/v1/public/forms/{event['slug']}/cfp/auth/request-code", json={"email": email}).json()[
        "dev_code"
    ]
    client.post(
        f"/api/v1/public/forms/{event['slug']}/cfp/auth/verify",
        json={"email": email, "code": code},
    )
    payload = {
        "title": "A backend plan submission",
        "track_id": cfp["track_id"],
        "format_id": cfp["format_id"],
        "participants": [{"email": email, "role": "speaker", "first_name": "Speaker"}],
    }
    draft = client.post(f"/api/v1/public/forms/{event['slug']}/cfp/submissions", json=payload)
    assert draft.status_code == 201, draft.text
    submission_id = draft.json()["id"]
    submitted = client.post(f"/api/v1/public/submissions/{submission_id}/submit", json=payload)
    assert submitted.status_code == 200, submitted.text
    return submission_id


def test_b1_b2_domain_fields_reference_codes_and_exports():
    with TestClient(app) as client:
        _login(client, "b1-owner@example.com")
        event = _event(client)
        response = client.post(
            f"/api/v1/events/{event['id']}/submissions",
            json={
                "title": "Manual abstract",
                "capacity": 100,
                "ceu_credits": 1.5,
                "client_session_id": "client-42",
                "starts_at": "2026-11-10T10:00:00Z",
                "ends_at": "2026-11-10T10:45:00Z",
                "language": "en",
            },
        )
        assert response.status_code == 201, response.text
        submission = response.json()
        assert submission["reference_code"] == "SESS-1"
        assert submission["capacity"] == 100
        assert submission["ceu_credits"] == 1.5
        assert submission["client_session_id"] == "client-42"

        updated = client.patch(
            f"/api/v1/submissions/{submission['id']}",
            json={"capacity": 120, "language": "fr"},
        )
        assert updated.status_code == 200
        assert updated.json()["capacity"] == 120
        assert updated.json()["language"] == "fr"

        csv_response = client.get(f"/api/v1/events/{event['id']}/submissions/export.csv")
        assert "reference_code" in csv_response.text
        assert "client-42" in csv_response.text
        xlsx_response = client.get(f"/api/v1/events/{event['id']}/submissions/export.xlsx")
        assert xlsx_response.status_code == 200
        assert xlsx_response.content[:2] == b"PK"


def test_b3_accepted_speaker_edit_and_lock():
    with TestClient(app) as client:
        _login(client, "b3-owner@example.com")
        event = _event(client)
        cfp = _cfp(client, event)
        submission_id = _submit(client, event, cfp, "b3-speaker@example.com")
        _login(client, "b3-owner@example.com")
        assert (
            client.post(f"/api/v1/submissions/{submission_id}/decision", json={"decision": "accepted"}).status_code
            == 200
        )

        _login(client, "b3-speaker@example.com")
        edited = client.patch(
            f"/api/v1/me/submissions/{submission_id}",
            json={"title": "Edited after acceptance"},
        )
        assert edited.status_code == 200
        assert edited.json()["title"] == "Edited after acceptance"

        _login(client, "b3-owner@example.com")
        form_id = cfp["form"]["id"]
        assert (
            client.patch(
                f"/api/v1/forms/{form_id}",
                json={"edit_locked_after": "2020-01-01T00:00:00Z"},
            ).status_code
            == 200
        )
        _login(client, "b3-speaker@example.com")
        locked = client.patch(f"/api/v1/me/submissions/{submission_id}", json={"title": "Locked"})
        assert locked.status_code == 409

        _login(client, "b3-owner@example.com")
        events = client.get(f"/api/v1/submissions/{submission_id}/events")
        assert events.status_code == 200
        assert any(event["action"] == "speaker_updated" for event in events.json())


def test_b6_session_import_preview_and_commit():
    with TestClient(app) as client:
        _login(client, "b6-owner@example.com")
        event = _event(client)
        csv_content = "title,track,format,room,starts_at,ends_at\nImported,Agents,Talk,Main,2026-11-10T10:00:00Z,2026-11-10T10:45:00Z\n"
        preview = client.post(
            f"/api/v1/events/{event['id']}/sessions/import/preview",
            files={"file": ("sessions.csv", csv_content.encode(), "text/csv")},
        )
        assert preview.status_code == 200, preview.text
        assert preview.json()["valid_rows"] == 1
        rows = preview.json()["rows"]
        committed = client.post(
            f"/api/v1/events/{event['id']}/sessions/import/commit",
            json={"rows": [rows[0]["values"]], "mapping": preview.json()["mapping"]},
        )
        assert committed.status_code == 200, committed.text
        assert committed.json()["count"] == 1


def test_b7_copy_templates_and_b8_portal_form_task():
    with TestClient(app) as client:
        _login(client, "b8-owner@example.com")
        source = _event(client)
        target = _event(client)
        source_task = client.post(
            f"/api/v1/events/{source['id']}/task-templates",
            json={"name": "Source task", "target_type": "submission"},
        ).json()
        copied = client.post(
            f"/api/v1/events/{target['id']}/task-templates/copy-from",
            json={"source_event_id": source["id"], "template_ids": [source_task["id"]]},
        )
        assert copied.status_code == 201
        assert copied.json()["templates"][0]["target_type"] == "submission"

        field = client.post(
            f"/api/v1/events/{target['id']}/field-definitions",
            json={"key": "av_needs", "label": "AV needs", "field_type": "long_text"},
        )
        assert field.status_code == 201
        portal_form = client.post(
            f"/api/v1/events/{target['id']}/portal-forms",
            json={
                "name": "AV form",
                "sections": [
                    {
                        "key": "main",
                        "title": "AV",
                        "fields": [{"key": "av_needs", "label": "AV needs", "required": True}],
                    }
                ],
            },
        )
        assert portal_form.status_code == 201
        form_id = portal_form.json()["id"]
        client.post(
            f"/api/v1/events/{target['id']}/task-templates",
            json={"name": "Complete AV", "task_type": "form", "portal_form_id": form_id},
        ).json()
        me = client.get("/api/v1/auth/me").json()
        generated = client.post(
            f"/api/v1/events/{target['id']}/task-assignments/generate",
            json={"person_id": me["person_id"]},
        )
        assert generated.status_code == 200
        form_task = next(task for task in client.get("/api/v1/me/tasks").json() if task["name"] == "Complete AV")
        invalid = client.post(f"/api/v1/me/tasks/{form_task['id']}/submit-form", json={"answers": {}})
        assert invalid.status_code == 400
        complete = client.post(
            f"/api/v1/me/tasks/{form_task['id']}/submit-form",
            json={"answers": {"av_needs": "Wireless mic"}},
        )
        assert complete.status_code == 200
        assert complete.json()["status"] == "completed"


def test_b9_file_requests_speaker_upload():
    with TestClient(app) as client:
        _login(client, "b9-owner@example.com")
        event = _event(client)
        cfp = _cfp(client, event)
        submission_id = _submit(client, event, cfp, "b9-speaker@example.com")
        _login(client, "b9-owner@example.com")
        assert (
            client.post(f"/api/v1/submissions/{submission_id}/decision", json={"decision": "accepted"}).status_code
            == 200
        )
        request = client.post(
            f"/api/v1/events/{event['id']}/file-requests",
            json={"title": "Upload supporting document", "target_type": "contact"},
        ).json()
        _login(client, "b9-speaker@example.com")
        intent = client.post(
            f"/api/v1/me/file-requests/{request['id']}/upload-intent",
            json={
                "filename": "notes.pdf",
                "content_type": "application/pdf",
                "size_bytes": 4,
                "file_type": "supporting",
            },
        )
        assert intent.status_code == 200, intent.text
        file_id = intent.json()["id"]
        assert client.post(f"/api/v1/files/{file_id}/content", content=b"%PDF").status_code == 200
        requests = client.get("/api/v1/me/file-requests")
        assert requests.status_code == 200
        assert requests.json()[0]["uploads"][0]["file_id"] == file_id


def test_b5_files_bundle_naming_sanitising_and_access():
    with TestClient(app) as client:
        _login(client, "b5-owner@example.com")
        event = _event(client)
        cfp = _cfp(client, event)
        submission_id = _submit(client, event, cfp, "b5-speaker@example.com")

        # Organiser attaches a file whose name would escape the archive root.
        _login(client, "b5-owner@example.com")
        intent = client.post(
            f"/api/v1/events/{event['id']}/files/upload-intent",
            json={
                "filename": "../../etc/passwd.pdf",
                "content_type": "application/pdf",
                "size_bytes": 4,
                "file_type": "supporting",
                "submission_id": submission_id,
            },
        )
        assert intent.status_code == 200, intent.text
        file_id = intent.json()["id"]
        assert client.post(f"/api/v1/files/{file_id}/content", content=b"%PDF").status_code == 200

        second_intent = client.post(
            f"/api/v1/events/{event['id']}/files/upload-intent",
            json={
                "filename": "speaker-notes.txt",
                "content_type": "text/plain",
                "size_bytes": 5,
                "file_type": "supporting",
                "submission_id": submission_id,
            },
        ).json()
        assert client.post(f"/api/v1/files/{second_intent['id']}/content", content=b"notes").status_code == 200
        third_intent = client.post(
            f"/api/v1/events/{event['id']}/files/upload-intent",
            json={
                "filename": "deck.pdf",
                "content_type": "application/pdf",
                "size_bytes": 4,
                "file_type": "slides",
                "submission_id": submission_id,
            },
        ).json()
        assert client.post(f"/api/v1/files/{third_intent['id']}/content", content=b"%PDF").status_code == 200

        bundle = client.get(
            f"/api/v1/events/{event['id']}/files/bundle.zip",
            params=[("file_ids", file_id), ("file_ids", third_intent["id"])],
        )
        assert bundle.status_code == 200, bundle.text
        assert bundle.headers["content-type"] == "application/zip"

        with zipfile.ZipFile(io.BytesIO(bundle.content)) as archive:
            names = archive.namelist()
        assert len(names) == 2
        entry = next(name for name in names if name.endswith("speaker-notes.txt"))
        # Sanitised: exactly one separator, no traversal segments, filed under
        # the submission's human reference code.
        assert entry.count("/") == 1
        assert ".." not in entry
        assert entry.endswith("speaker-notes.txt")
        reference = client.get(f"/api/v1/submissions/{submission_id}").json()["reference_code"]
        assert entry.startswith(f"{reference}/")

        all_bundle = client.get(f"/api/v1/events/{event['id']}/files/bundle.zip")
        with zipfile.ZipFile(io.BytesIO(all_bundle.content)) as archive:
            assert len(archive.namelist()) == 2

        # A different organiser with no binding on this event cannot pull the bundle.
        _login(client, "b5-outsider@example.com")
        denied = client.get(f"/api/v1/events/{event['id']}/files/bundle.zip")
        assert denied.status_code == 403, denied.text


def test_decision_message_reaches_the_speaker_email():
    """The organizer's note must land in the accept/decline email body.

    swyx Q&A #3 bonus: a decision should be able to carry requested changes or
    feedback, not arrive bare.
    """
    with TestClient(app) as client:
        owner = f"msg-owner-{uuid.uuid4().hex[:6]}@example.com"
        _login(client, owner)
        event = _event(client)
        speaker = f"msg-speaker-{uuid.uuid4().hex[:6]}@example.com"

        created = client.post(
            f"/api/v1/events/{event['id']}/submissions",
            json={
                "title": "A talk that needs changes",
                "participants": [{"email": speaker, "role": "speaker", "first_name": "Mag"}],
            },
        )
        assert created.status_code == 201, created.text
        submission_id = created.json()["id"]

        note = "Please shorten the abstract to 200 words."
        decided = client.post(
            f"/api/v1/submissions/{submission_id}/decision",
            json={"decision": "accepted", "notify": True, "message": note},
        )
        assert decided.status_code == 200, decided.text

        sent = client.get(f"/api/v1/events/{event['id']}/communications").json()
        assert any(c.get("related_submission_id") == submission_id for c in sent)

        # An absent note must collapse to nothing rather than leave an empty
        # quote block in the email body.
        assert _organizer_message_html(None) == ""
        assert _organizer_message_html("   ") == ""
        rendered = _organizer_message_html(note)
        assert note in rendered and "A note from the organizers" in rendered
        # Speaker-supplied text is escaped, never injected as markup.
        assert "&lt;script&gt;" in _organizer_message_html("<script>x</script>")


def test_starter_task_pack_is_idempotent_and_backs_forms():
    """swyx Q&A #5: the six must-have onboarding tasks ship out of the box.

    Two of them are questionnaires, so they must come with a portal form attached
    — a form task with no `portal_form_id` is unopenable from the portal.
    """
    with TestClient(app) as client:
        _login(client, f"starter-{uuid.uuid4().hex[:6]}@example.com")
        event = _event(client)

        first = client.post(f"/api/v1/events/{event['id']}/task-templates/starter-pack")
        assert first.status_code == 201, first.text
        assert first.json()["created"] == 6

        templates = client.get(f"/api/v1/events/{event['id']}/task-templates").json()
        by_name = {t["name"]: t for t in templates}
        assert "Confirm your hotel stay" in by_name
        assert "Submit flight reimbursement details" in by_name
        assert "Finalize your bio and photo" in by_name
        assert "Invite colleagues with your speaker discount" in by_name

        for name in ("Confirm your hotel stay", "Submit flight reimbursement details"):
            assert by_name[name]["task_type"] == "form"
            assert by_name[name]["portal_form_id"], f"{name} has no backing portal form"

        # Re-running must not duplicate anything.
        second = client.post(f"/api/v1/events/{event['id']}/task-templates/starter-pack")
        assert second.status_code == 201
        assert second.json()["created"] == 0
        assert len(client.get(f"/api/v1/events/{event['id']}/task-templates").json()) == len(templates)
        assert len(client.get(f"/api/v1/events/{event['id']}/portal-forms").json()) == 2


def test_solo_speaker_submission_seeds_the_submitter_as_participant():
    """A speaker submitting their own talk must not be told they need a speaker.

    The form declares `speaker: min 1`; we only recorded the submitter on
    `submitter_person_id`, so a solo submission failed validation on a person who
    was standing right there.
    """
    with TestClient(app) as client:
        owner = f"solo-owner-{uuid.uuid4().hex[:6]}@example.com"
        _login(client, owner)
        event = _event(client)
        cfp = _cfp(client, event)
        # The seeded CFP declares no participant roles, so give it one.
        assert (
            client.patch(
                f"/api/v1/forms/{cfp['form']['id']}",
                json={"participant_roles": [{"role": "speaker", "min": 1, "max": 4}]},
            ).status_code
            == 200
        )

        speaker = f"solo-speaker-{uuid.uuid4().hex[:6]}@example.com"
        code = client.post(
            f"/api/v1/public/forms/{event['slug']}/cfp/auth/request-code", json={"email": speaker}
        ).json()["dev_code"]
        client.post(f"/api/v1/public/forms/{event['slug']}/cfp/auth/verify", json={"email": speaker, "code": code})

        payload = {"title": "My own talk", "track_id": cfp["track_id"], "format_id": cfp["format_id"]}
        draft = client.post(f"/api/v1/public/forms/{event['slug']}/cfp/submissions", json=payload)
        assert draft.status_code == 201, draft.text

        submission_id = draft.json()["id"]
        submitted = client.post(f"/api/v1/public/submissions/{submission_id}/submit", json=payload)
        assert submitted.status_code == 200, submitted.text

        _login(client, owner)
        detail = client.get(f"/api/v1/submissions/{submission_id}")
        assert detail.status_code == 200, detail.text
        assert [p["email"] for p in detail.json()["participants"]] == [speaker]


def test_submitting_on_behalf_of_someone_else_does_not_add_the_submitter():
    """Naming a speaker means the submitter is a proxy, not a co-presenter.

    Seeding the submitter unconditionally would add a second speaker and break a
    form limited to `max: 1`.
    """
    with TestClient(app) as client:
        owner = f"proxy-owner-{uuid.uuid4().hex[:6]}@example.com"
        _login(client, owner)
        event = _event(client)
        cfp = _cfp(client, event)
        assert (
            client.patch(
                f"/api/v1/forms/{cfp['form']['id']}",
                json={"participant_roles": [{"role": "speaker", "min": 1, "max": 1}]},
            ).status_code
            == 200
        )

        proxy = f"proxy-{uuid.uuid4().hex[:6]}@example.com"
        presenter = f"presenter-{uuid.uuid4().hex[:6]}@example.com"
        code = client.post(
            f"/api/v1/public/forms/{event['slug']}/cfp/auth/request-code", json={"email": proxy}
        ).json()["dev_code"]
        client.post(f"/api/v1/public/forms/{event['slug']}/cfp/auth/verify", json={"email": proxy, "code": code})

        payload = {
            "title": "A talk by my colleague",
            "track_id": cfp["track_id"],
            "format_id": cfp["format_id"],
            "participants": [{"email": presenter, "role": "speaker", "first_name": "Pat"}],
        }
        draft = client.post(f"/api/v1/public/forms/{event['slug']}/cfp/submissions", json=payload)
        assert draft.status_code == 201, draft.text
        submission_id = draft.json()["id"]
        submitted = client.post(f"/api/v1/public/submissions/{submission_id}/submit", json=payload)
        assert submitted.status_code == 200, submitted.text
        _login(client, owner)
        detail = client.get(f"/api/v1/submissions/{submission_id}")
        assert detail.status_code == 200, detail.text
        assert [p["email"] for p in detail.json()["participants"]] == [presenter]


def test_email_transport_builds_a_real_multipart_message(monkeypatch):
    """The SMTP path must produce a genuine multipart/alternative message.

    swyx Q&A #6 asks for emails that work on an MVP basis. `email_enabled` is off
    by default so dev only logs — this exercises the delivery path itself, with
    the SMTP client stubbed, so a broken transport cannot pass unnoticed.
    """
    import smtplib

    from app.core.config import settings
    from app.email import EmailMessageInput, send_email

    sent: list = []

    class _FakeSMTP:
        def __init__(self, host, port, timeout=None):
            sent.append({"host": host, "port": port})

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def starttls(self):
            sent[-1]["tls"] = True

        def login(self, user, password):
            sent[-1]["login"] = user

        def send_message(self, msg):
            sent[-1]["msg"] = msg

    monkeypatch.setattr(smtplib, "SMTP", _FakeSMTP)
    monkeypatch.setattr(settings, "email_enabled", True)
    monkeypatch.setattr(settings, "email_provider", "smtp")
    monkeypatch.setattr(settings, "smtp_use_tls", True)
    monkeypatch.setattr(settings, "smtp_username", "api_token")

    send_email(
        EmailMessageInput(
            to="speaker@example.com",
            subject="Your talk was accepted",
            html="<p>Congratulations!</p>",
        )
    )

    assert len(sent) == 1
    assert sent[0]["tls"] is True, "STARTTLS must be negotiated when smtp_use_tls is set"
    assert sent[0]["login"] == "api_token"
    msg = sent[0]["msg"]
    assert msg["Subject"] == "Your talk was accepted"
    types = [part.get_content_type() for part in msg.walk()]
    assert "text/plain" in types and "text/html" in types, types


def test_cloudflare_provider_requires_credentials(monkeypatch):
    """Misconfiguration must fail loudly rather than silently dropping mail."""
    import pytest

    from app.core.config import settings
    from app.email import EmailMessageInput, send_email

    monkeypatch.setattr(settings, "email_enabled", True)
    monkeypatch.setattr(settings, "email_provider", "cloudflare")
    monkeypatch.setattr(settings, "cloudflare_api_token", None)
    monkeypatch.setattr(settings, "cloudflare_account_id", None)

    with pytest.raises(RuntimeError, match="CLOUDFLARE_API_TOKEN"):
        send_email(EmailMessageInput(to="a@example.com", subject="x", html="<p>x</p>"))


def test_cloudflare_rest_payload_and_error_handling(monkeypatch):
    """Build the exact body Cloudflare's REST API expects, and fail on success:false.

    Cloudflare returns HTTP 200 with `success: false` for rejected mail, so a
    naive status-code check would record a delivery that never happened.
    """
    import json as _json
    import urllib.request

    import pytest

    from app.core.config import settings
    from app.email import Attachment, EmailMessageInput, send_email

    captured: dict = {}

    class _Response:
        def __init__(self, body: bytes):
            self._body = body

        def read(self):
            return self._body

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    def _fake_urlopen(request, timeout=None):
        captured["url"] = request.full_url
        captured["headers"] = dict(request.headers)
        captured["body"] = _json.loads(request.data.decode())
        return _Response(captured["response"])

    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen)
    monkeypatch.setattr(settings, "email_enabled", True)
    monkeypatch.setattr(settings, "email_provider", "cloudflare")
    monkeypatch.setattr(settings, "cloudflare_api_token", "cf-token")
    monkeypatch.setattr(settings, "cloudflare_account_id", "acct-123")

    captured["response"] = b'{"success": true, "errors": [], "result": {"delivered": ["s@example.com"]}}'
    send_email(
        EmailMessageInput(
            to="s@example.com",
            subject="Your talk was accepted",
            html="<p>Congratulations!</p>",
            reply_to="organizers@example.com",
            attachments=[Attachment(content=b"BEGIN:VCALENDAR", filename="invite.ics", content_type="text/calendar")],
        )
    )

    assert captured["url"] == "https://api.cloudflare.com/client/v4/accounts/acct-123/email/sending/send"
    assert captured["headers"]["Authorization"] == "Bearer cf-token"
    body = captured["body"]
    assert body["to"] == "s@example.com"
    assert body["subject"] == "Your talk was accepted"
    assert body["headers"]["Reply-To"] == "organizers@example.com"
    # A plain-text alternative is derived when only HTML is supplied.
    assert "Congratulations" in body["text"]
    assert body["attachments"][0]["filename"] == "invite.ics"
    assert body["attachments"][0]["type"] == "text/calendar"

    # HTTP 200 + success:false must still raise.
    captured["response"] = b'{"success": false, "errors": [{"message": "sender domain not onboarded"}]}'
    with pytest.raises(RuntimeError, match="sender domain not onboarded"):
        send_email(EmailMessageInput(to="s@example.com", subject="x", html="<p>x</p>"))


def test_cloudflare_smtp_uses_implicit_tls(monkeypatch):
    """Cloudflare's submission endpoint is implicit TLS on 465, not STARTTLS.

    Connecting with plain `SMTP` and calling `starttls()` — which is what the
    generic path does — fails against port 465.
    """
    import smtplib

    from app.core.config import settings
    from app.email import EmailMessageInput, send_email

    used: dict = {}

    class _FakeSMTPSSL:
        def __init__(self, host, port, timeout=None):
            used["class"] = "SMTP_SSL"
            used["host"] = host
            used["port"] = port

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def starttls(self):
            used["starttls"] = True

        def login(self, user, password):
            used["login"] = (user, password)

        def send_message(self, msg):
            used["sent"] = True

    monkeypatch.setattr(smtplib, "SMTP_SSL", _FakeSMTPSSL)
    monkeypatch.setattr(settings, "email_enabled", True)
    monkeypatch.setattr(settings, "email_provider", "smtp")
    monkeypatch.setattr(settings, "smtp_use_ssl", True)
    monkeypatch.setattr(settings, "smtp_use_tls", True)  # must be ignored when SSL is on
    monkeypatch.setattr(settings, "smtp_host", "smtp.mx.cloudflare.net")
    monkeypatch.setattr(settings, "smtp_port", 465)
    monkeypatch.setattr(settings, "smtp_username", "api_token")
    monkeypatch.setattr(settings, "smtp_password", "cf-token")

    send_email(EmailMessageInput(to="s@example.com", subject="x", html="<p>x</p>"))

    assert used["class"] == "SMTP_SSL"
    assert (used["host"], used["port"]) == ("smtp.mx.cloudflare.net", 465)
    assert "starttls" not in used, "STARTTLS must not be attempted on an implicit-TLS connection"
    assert used["login"] == ("api_token", "cf-token")
    assert used["sent"] is True


def test_pending_review_submissions_are_assignable_to_reviewers():
    """A submission awaiting review must be in an evaluation plan's scope.

    Scoping on `status == "submitted"` alone meant that moving a submission to
    "pending review" — the state that exists precisely to say "a reviewer should
    look at this" — made it invisible to reviewer assignment.
    """
    with TestClient(app) as client:
        owner = f"eval-owner-{uuid.uuid4().hex[:6]}@example.com"
        _login(client, owner)
        event = _event(client)

        created = client.post(
            f"/api/v1/events/{event['id']}/submissions",
            json={"title": "Awaiting review", "status": "submitted"},
        )
        assert created.status_code == 201, created.text
        submission_id = created.json()["id"]

        moved = client.post(
            f"/api/v1/submissions/{submission_id}/decision",
            json={"decision": "pending_review", "notify": False},
        )
        assert moved.status_code == 200, moved.text

        plan = client.post(
            f"/api/v1/events/{event['id']}/evaluation-plans",
            json={"name": "Round 1", "criteria": [{"key": "quality", "label": "Quality"}]},
        )
        assert plan.status_code == 201, plan.text

        assigned = client.post(
            f"/api/v1/evaluation-plans/{plan.json()['id']}/assignments",
            json={"reviewers": [f"rev-{uuid.uuid4().hex[:6]}@example.com"]},
        )
        assert assigned.status_code == 200, assigned.text


def test_submission_can_span_multiple_tracks():
    """swyx Q&A #2: "talks are submitted to one or more tracks".

    The first track stays `track_id` (the primary), so exports, agenda views and
    track pills are unaffected; extras live in the join table. A reviewer scoped
    to a secondary track must still see the talk.
    """
    with TestClient(app) as client:
        owner = f"tracks-owner-{uuid.uuid4().hex[:6]}@example.com"
        _login(client, owner)
        event = _event(client)

        # Two tracks to cross-list between.
        agents = client.get(f"/api/v1/events/{event['id']}/tracks").json()[0]
        infra = client.post(f"/api/v1/events/{event['id']}/tracks", json={"name": "Infra"}).json()

        created = client.post(
            f"/api/v1/events/{event['id']}/submissions",
            json={"title": "Cross-listed talk", "track_ids": [agents["id"], infra["id"]], "status": "submitted"},
        )
        assert created.status_code == 201, created.text
        body = created.json()
        assert body["track_id"] == agents["id"], "first entry must become the primary track"
        assert body["track_ids"] == [agents["id"], infra["id"]]

        # Reviewers scoped to the *secondary* track must still get it assigned.
        plan = client.post(
            f"/api/v1/events/{event['id']}/evaluation-plans",
            json={
                "name": "Infra reviewers",
                "scope": {"track_ids": [infra["id"]]},
                "criteria": [{"key": "quality", "label": "Quality"}],
            },
        )
        assert plan.status_code == 201, plan.text
        assigned = client.post(
            f"/api/v1/evaluation-plans/{plan.json()['id']}/assignments",
            json={"reviewers": [f"infra-rev-{uuid.uuid4().hex[:6]}@example.com"]},
        )
        assert assigned.status_code == 200, assigned.text

        # Narrowing back to a single track drops the extra.
        updated = client.patch(
            f"/api/v1/submissions/{body['id']}",
            json={"track_ids": [infra["id"]]},
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["track_id"] == infra["id"]
        assert updated.json()["track_ids"] == [infra["id"]]


def test_public_form_exposes_conditional_rules():
    """The public CFP must receive the form's conditional rules.

    They were stored and evaluated server-side on submit, but omitted from the
    public payload — so a conditional field rendered unconditionally to every
    speaker and the feature was invisible on the one surface that uses it.
    """
    with TestClient(app) as client:
        _login(client, f"cond-owner-{uuid.uuid4().hex[:6]}@example.com")
        event = _event(client)
        fmt = client.get(f"/api/v1/events/{event['id']}/formats").json()[0]

        form = client.post(
            f"/api/v1/events/{event['id']}/forms",
            json={
                "internal_name": "Conditional CFP",
                "public_title": "Call for Speakers",
                "slug": "cfp",
                "sections": [
                    {
                        "key": "main",
                        "title": "Main",
                        "fields": [
                            {"key": "title", "label": "Title", "field_type": "system",
                             "system_field": "title", "required": True},
                            {"key": "format", "label": "Format", "field_type": "dropdown",
                             "system_field": "format"},
                            {"key": "workshop_prerequisites", "label": "Workshop prerequisites",
                             "field_type": "long_text"},
                        ],
                    }
                ],
                "conditional_rules": [
                    {
                        "field": "format",
                        "operator": "not_equals",
                        "value": fmt["id"],
                        "actions": [{"kind": "hide", "target": "workshop_prerequisites"}],
                    }
                ],
            },
        )
        assert form.status_code == 201, form.text
        assert client.post(f"/api/v1/forms/{form.json()['id']}/publish").status_code == 200

        public = client.get(f"/api/v1/public/forms/{event['slug']}/cfp")
        assert public.status_code == 200, public.text
        rules = public.json().get("conditional_rules")
        assert rules, "public form payload carries no conditional rules"
        assert rules[0]["field"] == "format"
        assert rules[0]["actions"][0]["target"] == "workshop_prerequisites"


def test_speaker_can_resume_a_cfp_draft():
    """A draft must be findable and re-readable so the CFP can offer to resume it.

    The eval kit checks that leaving and returning to the form offers the draft
    back with the title pre-filled; that needs the form id on the public payload
    (to match the draft to this form) and the draft itself on /me/submissions.
    """
    with TestClient(app) as client:
        _login(client, f"draft-owner-{uuid.uuid4().hex[:6]}@example.com")
        event = _event(client)
        cfp = _cfp(client, event)

        public = client.get(f"/api/v1/public/forms/{event['slug']}/cfp").json()
        assert public["id"] == cfp["form"]["id"], "public payload must carry the form id"

        speaker = f"draft-speaker-{uuid.uuid4().hex[:6]}@example.com"
        code = client.post(
            f"/api/v1/public/forms/{event['slug']}/cfp/auth/request-code", json={"email": speaker}
        ).json()["dev_code"]
        client.post(f"/api/v1/public/forms/{event['slug']}/cfp/auth/verify", json={"email": speaker, "code": code})

        title = "Taming 40-Minute CI: Incremental Builds at Monorepo Scale"
        draft = client.post(
            f"/api/v1/public/forms/{event['slug']}/cfp/submissions",
            json={"title": title},
        )
        assert draft.status_code == 201, draft.text

        # Simulate coming back later: re-read what this speaker has in flight.
        mine = client.get("/api/v1/me/submissions").json()
        resumable = [s for s in mine if s["form_id"] == public["id"] and s["status"] == "draft"]
        assert len(resumable) == 1, "draft is not offered back to the speaker"
        assert resumable[0]["title"] == title, "title is not preserved for pre-filling"


def test_cfp_window_is_enforced_not_just_the_status_flag():
    """CFP-04/CFP-16: a past close date closes the call, and editing with it.

    The status flag used to be the only gate, so a form whose deadline had
    passed kept accepting proposals until someone closed it by hand.
    """
    with TestClient(app) as client:
        owner = f"window-owner-{uuid.uuid4().hex[:6]}@example.com"
        _login(client, owner)
        event = _event(client)
        cfp = _cfp(client, event)
        speaker = f"window-speaker-{uuid.uuid4().hex[:6]}@example.com"

        # Open now: a draft is accepted, and the public payload says so.
        public = client.get(f"/api/v1/public/forms/{event['slug']}/cfp").json()
        assert public["accepting_submissions"] is True

        code = client.post(
            f"/api/v1/public/forms/{event['slug']}/cfp/auth/request-code", json={"email": speaker}
        ).json()["dev_code"]
        client.post(f"/api/v1/public/forms/{event['slug']}/cfp/auth/verify", json={"email": speaker, "code": code})
        draft = client.post(
            f"/api/v1/public/forms/{event['slug']}/cfp/submissions", json={"title": "Before the deadline"}
        )
        assert draft.status_code == 201, draft.text
        submission_id = draft.json()["id"]

        # Move the close date into the past while the status stays "open".
        _login(client, owner)
        assert (
            client.patch(
                f"/api/v1/forms/{cfp['form']['id']}", json={"close_at": "2020-01-01T00:00:00Z"}
            ).status_code
            == 200
        )

        public = client.get(f"/api/v1/public/forms/{event['slug']}/cfp").json()
        assert public["accepting_submissions"] is False
        assert public["closed_reason"]

        _login(client, speaker)
        mine = client.get("/api/v1/me/submissions").json()
        locked_view = next(item for item in mine if item["id"] == submission_id)
        assert locked_view["can_edit"] is False
        assert "closed" in locked_view["edit_lock_reason"].lower()
        blocked = client.post(
            f"/api/v1/public/forms/{event['slug']}/cfp/submissions", json={"title": "Too late"}
        )
        assert blocked.status_code == 400, "a closed call still accepted a new submission"

        # CFP-16: editing an existing submission also locks.
        locked = client.patch(f"/api/v1/me/submissions/{submission_id}", json={"title": "Sneaky edit"})
        assert locked.status_code == 409, locked.text


def test_agenda_publish_and_public_program():
    """AIA-07 + CNT-12 + EMB-14: publishing exposes approved sessions publicly."""
    with TestClient(app) as client:
        _login(client, f"pub-owner-{uuid.uuid4().hex[:6]}@example.com")
        event = _event(client)
        room = client.get(f"/api/v1/events/{event['id']}/rooms").json()[0]

        created = client.post(
            f"/api/v1/events/{event['id']}/sessions",
            json={"title": "Keynote: shipping agents", "duration_minutes": 45},
        )
        assert created.status_code == 201, created.text
        session_id = created.json()["id"]
        assert created.json()["approval_status"] == "pending", "sessions must not be public by default"

        # Unscheduled + unapproved: invisible to the public.
        program = client.get(f"/api/v1/public/events/{event['slug']}/program").json()
        assert program["sessions"] == []

        assert (
            client.patch(
                f"/api/v1/sessions/{session_id}/schedule",
                json={
                    "room_id": room["id"],
                    "starts_at": "2026-11-10T17:00:00Z",
                    "ends_at": "2026-11-10T17:45:00Z",
                },
            ).status_code
            == 200
        )

        published = client.post(f"/api/v1/events/{event['id']}/agenda/publish")
        assert published.status_code == 200, published.text
        assert published.json()["published_sessions"] == 1

        program = client.get(f"/api/v1/public/events/{event['slug']}/program").json()
        assert len(program["sessions"]) == 1
        assert program["sessions"][0]["title"] == "Keynote: shipping agents"
        assert program["sessions"][0]["room"]["name"] == room["name"]
        assert program["event"]["agenda_published_at"]


def test_speaker_csv_import_matches_the_eval_fixture_columns():
    """SPK-03: the fixture ships name,email,title,company,bio — not first/last."""
    with TestClient(app) as client:
        _login(client, f"csv-owner-{uuid.uuid4().hex[:6]}@example.com")
        event = _event(client)
        csv_content = (
            "name,email,title,company,bio\n"
            "Priya Raman,priya.csv@example.com,Principal Engineer,Latticework Systems,Leads build tooling.\n"
            "Marcus Okafor,marcus.csv@example.com,Staff Developer Advocate,Cloudreach Labs,Writes Agents Weekly.\n"
        )
        result = client.post(
            f"/api/v1/events/{event['id']}/speakers/import",
            files={"file": ("speakers.csv", csv_content.encode(), "text/csv")},
        )
        assert result.status_code == 201, result.text
        assert result.json()["created"] == 2
        assert result.json()["errors"] == []

        roster = client.get(f"/api/v1/events/{event['id']}/speakers").json()
        by_email = {s["email"]: s for s in roster}
        assert by_email["priya.csv@example.com"]["first_name"] == "Priya"
        assert by_email["priya.csv@example.com"]["last_name"] == "Raman"
        assert by_email["priya.csv@example.com"]["job_title"] == "Principal Engineer"

        # Re-import must update, not duplicate.
        again = client.post(
            f"/api/v1/events/{event['id']}/speakers/import",
            files={"file": ("speakers.csv", csv_content.encode(), "text/csv")},
        )
        assert again.json()["created"] == 0 and again.json()["updated"] == 2
        assert len(client.get(f"/api/v1/events/{event['id']}/speakers").json()) == len(roster)


def test_file_versions_comments_and_session_history():
    """CNT-04, CNT-05, CNT-11 — versioning, comments, and restorable history."""
    with TestClient(app) as client:
        owner = f"cnt-owner-{uuid.uuid4().hex[:6]}@example.com"
        _login(client, owner)
        event = _event(client)

        created = client.post(
            f"/api/v1/events/{event['id']}/sessions", json={"title": "Original title"}
        ).json()
        session_id = created["id"]

        def upload(name: str) -> str:
            intent = client.post(
                f"/api/v1/events/{event['id']}/files/upload-intent",
                json={
                    "filename": name,
                    "content_type": "application/pdf",
                    "size_bytes": 10,
                    "file_type": "slides",
                    "session_id": session_id,
                },
            )
            assert intent.status_code == 200, intent.text
            file_id = intent.json()["id"]
            assert (
                client.post(f"/api/v1/files/{file_id}/content", content=b"%PDF-1.4 fake").status_code == 200
            )
            return file_id

        first = upload("slides-v1.pdf")
        second = upload("slides-v2.pdf")

        # CNT-04: re-uploading supersedes rather than overwrites.
        versions = client.get(f"/api/v1/files/{second}/versions").json()
        assert [v["version"] for v in versions] == [2, 1], versions
        assert versions[0]["is_latest"] is True and versions[1]["is_latest"] is False
        assert client.get(f"/api/v1/files/{first}/download").status_code == 200, "old version must stay downloadable"

        # CNT-05: comments carry author and timestamp, and are readable back.
        posted = client.post(f"/api/v1/files/{second}/comments", json={"body": "Please add slide numbers."})
        assert posted.status_code == 201, posted.text
        comments = client.get(f"/api/v1/files/{second}/comments").json()
        assert len(comments) == 1
        assert comments[0]["body"] == "Please add slide numbers."
        assert comments[0]["author_name"] and comments[0]["created_at"]

        # CNT-11: edits are recorded and a prior version can be restored.
        assert client.patch(f"/api/v1/sessions/{session_id}", json={"title": "Revised title"}).status_code == 200
        revisions = client.get(f"/api/v1/sessions/{session_id}/revisions").json()
        assert len(revisions) == 1
        assert revisions[0]["changed_fields"] == ["title"]
        assert revisions[0]["snapshot"]["title"] == "Original title"
        assert revisions[0]["editor_name"]

        restored = client.post(
            f"/api/v1/sessions/{session_id}/revisions/{revisions[0]['id']}/restore"
        )
        assert restored.status_code == 200, restored.text
        assert restored.json()["title"] == "Original title"


def test_abstract_management_depth(monkeypatch):
    """ABS-01/03/06/08/09/12/13/14 — rounds, scorecard depth, assignment, recusal."""
    with TestClient(app) as client:
        owner = f"abs-owner-{uuid.uuid4().hex[:6]}@example.com"
        _login(client, owner)
        event = _event(client)

        for i in range(4):
            client.post(
                f"/api/v1/events/{event['id']}/submissions",
                json={"title": f"Proposal {i}", "status": "submitted"},
            )

        # ABS-01: two independent rounds, each with its own window and scorecard.
        # ABS-03: numeric, dropdown and free-text criteria all persist.
        round1 = client.post(
            f"/api/v1/events/{event['id']}/evaluation-plans",
            json={
                "name": "Round 1 — triage",
                "round_number": 1,
                "opens_at": "2026-09-01T00:00:00Z",
                "closes_at": "2026-09-15T00:00:00Z",
                "blind_review": True,
                "criteria": [
                    {"key": "relevance", "label": "Relevance", "type": "numeric", "scale_max": 5, "weight": 2},
                    {"key": "recommend", "label": "Recommendation", "type": "dropdown",
                     "options": ["Advance", "Maybe", "Cut"]},
                    {"key": "notes", "label": "Notes", "type": "text", "required": False},
                ],
            },
        )
        assert round1.status_code == 201, round1.text
        plan = round1.json()
        assert plan["opens_at"] and plan["closes_at"]
        assert [c["type"] for c in plan["criteria"]] == ["numeric", "dropdown", "text"]
        assert plan["criteria"][1]["options"] == ["Advance", "Maybe", "Cut"]

        round2 = client.post(
            f"/api/v1/events/{event['id']}/evaluation-plans",
            json={"name": "Round 2 — final", "round_number": 2,
                  "criteria": [{"key": "quality", "label": "Quality"}]},
        )
        assert round2.status_code == 201
        assert round2.json()["round_number"] == 2

        # ABS-06: distribute across reviewers with a cap, rather than everyone-reads-everything.
        r1, r2 = f"rev1-{uuid.uuid4().hex[:5]}@example.com", f"rev2-{uuid.uuid4().hex[:5]}@example.com"
        assigned = client.post(
            f"/api/v1/evaluation-plans/{plan['id']}/assignments",
            json={"reviewers": [r1, r2], "strategy": "distribute", "per_reviewer_cap": 1},
        )
        assert assigned.status_code == 200, assigned.text
        assert assigned.json()["created"] == 2, assigned.json()
        assert assigned.json()["skipped_by_cap"] >= 1, "cap was not applied"

        # ABS-08: per-reviewer progress.
        progress = client.get(f"/api/v1/evaluation-plans/{plan['id']}/progress").json()
        assert len(progress) == 2
        assert all(p["assigned"] == 1 and p["completed"] == 0 for p in progress)

        # ABS-09: remind only reviewers with outstanding work.
        reminded = client.post(f"/api/v1/evaluation-plans/{plan['id']}/remind")
        assert reminded.status_code == 200 and reminded.json()["sent"] == 2

        # ABS-14: real structured model output is persisted, idempotent, and
        # visibly overridable by a human organizer.
        submission_id = client.get(f"/api/v1/events/{event['id']}/submissions").json()[0]["id"]
        from types import SimpleNamespace

        from app.core.config import settings
        from app.services import ai_review_service

        captured = {}

        class FakeResponses:
            def parse(self, **kwargs):
                captured.update(kwargs)
                return SimpleNamespace(
                    id="resp_test_123",
                    output_parsed=ai_review_service.AiReviewOutput(
                        criteria=[
                            ai_review_service.CriterionAssessment(
                                key="relevance", score=4, rationale="Strong fit for the stated audience."
                            )
                        ],
                        overall_score=4.2,
                        summary="Useful, specific proposal with a clear audience outcome.",
                        flags=["human-check-recommended"],
                    ),
                    usage=SimpleNamespace(input_tokens=320, output_tokens=84),
                )

        monkeypatch.setattr(settings, "ai_review_enabled", True)
        monkeypatch.setattr(settings, "openai_api_key", "test-key")
        monkeypatch.setattr(ai_review_service, "_client", lambda: SimpleNamespace(responses=FakeResponses()))

        ai_url = f"/api/v1/evaluation-plans/{plan['id']}/ai-reviews/{submission_id}"
        triage = client.post(ai_url, headers={"Idempotency-Key": "abs-test-run"})
        assert triage.status_code == 200, triage.text
        assert triage.json()["status"] == "completed"
        assert triage.json()["provider_response_id"] == "resp_test_123"
        assert triage.json()["rationale"]
        assert triage.json()["input_tokens"] == 320
        assert '"blind_review": true' in captured["input"]
        assert "speaker" not in captured["input"].lower()

        repeated = client.post(ai_url, headers={"Idempotency-Key": "abs-test-run"})
        assert repeated.json()["id"] == triage.json()["id"]
        assert len(client.get(ai_url).json()) == 1

        overridden = client.patch(
            f"/api/v1/evaluation-plans/{plan['id']}/ai-reviews/{triage.json()['id']}/override",
            json={"score": 3.5, "reason": "The evidence is strong, but the topic overlaps another session."},
        )
        assert overridden.status_code == 200, overridden.text
        assert overridden.json()["overall_score"] == 4.2
        assert overridden.json()["override_score"] == 3.5

        # ABS-12: a reviewer recuses instead of scoring, and drops out of the maths.
        _login(client, r1)
        mine = client.get("/api/v1/reviewer/assignments").json()
        assert len(mine) == 1
        recused = client.post(
            f"/api/v1/review-assignments/{mine[0]['id']}/recuse", json={"reason": "I manage this speaker."}
        )
        assert recused.status_code == 200, recused.text
        assert recused.json()["status"] == "recused"

        _login(client, owner)
        progress = client.get(f"/api/v1/evaluation-plans/{plan['id']}/progress").json()
        recused_row = next(p for p in progress if p["email"] == r1)
        assert recused_row["recused"] == 1 and recused_row["assigned"] == 0

        # ABS-13: exportable review data.
        export = client.get(f"/api/v1/events/{event['id']}/reviews/export.csv")
        assert export.status_code == 200
        assert "reviewer" in export.text and "weighted_score" in export.text
