import re
from collections import Counter
from datetime import datetime
from html import escape as html_escape
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.email import EmailMessageInput, send_email
from app.email.templates import submission_received_email
from app.models.auth import AuditEvent, EmailJobReceipt, RoleBinding, User
from app.models.cfp import Submission, SubmissionEvent, SubmissionForm
from app.models.program import Event
from app.repositories import Repositories
from app.rules.engine import apply_routing, evaluate_conditional_rules, required_fields, visible_field_keys
from app.schemas.submissions import ParticipantRead, SubmissionRead, SubmissionWrite
from app.services import communication_service, evaluation_service, session_service, task_service

SUBMISSION_DECISIONS = {
    "pending_review",
    "accept_queue",
    "decline_queue",
    "accepted",
    "declined",
    "withdrawn",
}

_ALLOWED_TRANSITIONS = {
    "submitted": {"pending_review", "accept_queue", "decline_queue", "accepted", "declined", "withdrawn"},
    "pending_review": {"accept_queue", "decline_queue", "accepted", "declined", "withdrawn"},
    "accept_queue": {"accepted", "decline_queue", "declined", "withdrawn"},
    "decline_queue": {"declined", "accept_queue", "accepted", "withdrawn"},
    "accepted": {"withdrawn", "declined"},
    "declined": {"accepted", "withdrawn"},
    "draft": {"submitted", "withdrawn"},
    "withdrawn": set(),
}

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_URL_RE = re.compile(r"^(https?|ftp)://[^\s]+$")


def _is_empty(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}


def _is_number(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return True
    return isinstance(value, str) and bool(re.fullmatch(r"-?\d+(\.\d+)?", value.strip()))


def _is_date(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def _to_answers(submission: Submission) -> dict[str, Any]:
    answers = dict(submission.custom_answers_json or {})
    if submission.title:
        answers["title"] = submission.title
    if submission.description:
        answers["description"] = submission.description
    if submission.format_id:
        answers["format"] = submission.format_id
    if submission.track_id:
        answers["track"] = submission.track_id
    if submission.level:
        answers["level"] = submission.level
    return answers


def validate_submission(form: SubmissionForm, submission: Submission, repos: Repositories) -> list[str]:
    errors: list[str] = []
    answers = _to_answers(submission)
    sections = form.sections_fields_json or []
    rules = form.conditional_rules_json or []

    visibility = evaluate_conditional_rules(answers, rules)
    visible = visible_field_keys(sections, visibility)
    force_required = required_fields(answers, rules)

    fields_by_key = {f["key"]: f for section in sections for f in section.get("fields", [])}

    for key in visible:
        field = fields_by_key.get(key)
        if not field:
            continue
        label = field.get("label") or key
        value = answers.get(key)

        is_required = bool(field.get("required")) or key in force_required
        if is_required and _is_empty(value):
            errors.append(f"{label} is required.")
            continue
        if _is_empty(value):
            continue

        field_type = field.get("field_type")
        if field_type == "number" and not _is_number(value):
            errors.append(f"{label} must be a number.")
        elif field_type == "email" and (not isinstance(value, str) or not _EMAIL_RE.match(value)):
            errors.append(f"{label} must be a valid email address.")
        elif field_type == "url" and (not isinstance(value, str) or not _URL_RE.match(value)):
            errors.append(f"{label} must be a valid URL.")
        elif field_type == "date" and not _is_date(value):
            errors.append(f"{label} must be a valid date.")
        elif field_type in ("dropdown", "radio"):
            options = field.get("options") or []
            if options and value not in options:
                errors.append(f"{label} must be one of: {', '.join(options)}.")
        elif field_type in ("multi_select", "checkbox"):
            options = field.get("options") or []
            if options and (not isinstance(value, list) or not set(value) <= set(options)):
                errors.append(f"{label} must select from: {', '.join(options)}.")
        if field_type in ("short_text", "long_text") and field.get("max_length"):
            if len(str(value)) > field["max_length"]:
                errors.append(f"{label} must be at most {field['max_length']} characters.")

    if not submission.title:
        errors.append("Title is required.")

    if submission.format_id and repos.formats.get(submission.format_id) is None:
        errors.append("Invalid session format.")
    if submission.track_id and repos.tracks.get(submission.track_id) is None:
        errors.append("Invalid track.")

    participants = repos.submission_participants.list_for_submission(submission.id)
    counts: Counter[str] = Counter(p.role for p in participants)
    for role_config in form.participant_roles_json or []:
        role = role_config.get("role")
        count = counts.get(role, 0)
        if count < role_config.get("min", 0):
            errors.append(f"{role} requires at least {role_config['min']} participant(s).")
        if count > role_config.get("max", 1):
            errors.append(f"{role} allows at most {role_config['max']} participant(s).")

    return errors


def _apply_payload(
    submission: Submission,
    payload: SubmissionWrite,
    db: Session | None = None,
    repos: Repositories | None = None,
) -> None:
    values = payload.model_dump(exclude_unset=True)
    for field in (
        "title",
        "description",
        "format_id",
        "track_id",
        "level",
        "capacity",
        "ceu_credits",
        "client_session_id",
        "starts_at",
        "ends_at",
        "language",
    ):
        if field in values:
            setattr(submission, field, values[field])
    if "custom_answers" in values:
        submission.custom_answers_json = values["custom_answers"]
    # `track_ids` wins over `track_id` when both are sent, since it carries the
    # primary track as its first entry.
    if values.get("track_ids") is not None and db is not None and repos is not None:
        set_tracks(db, repos, submission, values["track_ids"])


def _allocate_reference_code(db: Session, repos: Repositories, event_id: str) -> str:
    return f"SESS-{repos.events.allocate_submission_number(event_id)}"


def _with_submitter(form: SubmissionForm, person, participants: list) -> list:
    """Seed the submitter as the sole participant when none were named.

    A form that declares `speaker: min 1` otherwise rejects a solo speaker's own
    submission with "speaker requires at least 1 participant(s)" — they are the
    speaker, but we only recorded them as `submitter_person_id`.

    Only applies to an *empty* list. Once the submitter has named anyone, they
    have told us who is presenting; adding themselves on top would break
    submitting on behalf of someone else and blow past a `max: 1` speaker limit.
    """
    roles = form.participant_roles_json or []
    if participants or not roles or person is None:
        return participants

    from app.schemas.submissions import ParticipantInput

    default_role = roles[0].get("role") or "speaker"
    return [
        ParticipantInput(
            email=person.primary_email,
            role=default_role,
            first_name=person.first_name,
            last_name=person.last_name,
            company=person.company,
            job_title=person.job_title,
        ),
        *participants,
    ]


def _submitter_first(
    repos: Repositories, submission: Submission, participants: list, form: SubmissionForm | None
) -> list:
    """`_with_submitter` for paths that only have the submission to hand."""
    if form is None:
        form = repos.forms.get(submission.form_id) if submission.form_id else None
    if form is None or not submission.submitter_person_id:
        return participants
    person = repos.people.get(submission.submitter_person_id)
    return _with_submitter(form, person, participants)


def _set_participants(db: Session, repos: Repositories, submission_id: str, participants: list) -> None:
    repos.submission_participants.delete_for_submission(submission_id)
    for idx, participant in enumerate(participants):
        if isinstance(participant, dict):
            from app.schemas.submissions import ParticipantInput

            participant = ParticipantInput(**participant)
        data = {
            k: v
            for k, v in {
                "first_name": participant.first_name,
                "last_name": participant.last_name,
                "company": participant.company,
                "job_title": participant.job_title,
                "bio": participant.bio,
            }.items()
            if v is not None
        }
        person = repos.people.upsert_by_email(participant.email, data)
        repos.submission_participants.create(
            submission_id, {"person_id": person.id, "role": participant.role, "sort_order": idx}
        )


def _send_confirmation(form: SubmissionForm, submission: Submission, repos: Repositories) -> str:
    submitter = repos.people.get(submission.submitter_person_id) if submission.submitter_person_id else None
    event = repos.events.get(form.event_id)
    event_name = event.name if event else "our conference"
    rendered = submission_received_email(
        event_name=event_name,
        form_name=form.public_title,
        recipient_name=submitter.first_name if submitter and submitter.first_name else "",
        submission_title=submission.title or "Your proposal",
    )
    recipient = (submitter.primary_email if submitter else None) or "noreply@localhost"
    return send_email(
        EmailMessageInput(
            to=recipient,
            subject=rendered.subject,
            html=rendered.html,
            text=rendered.text,
            from_name=event.email_sender_name if event and event.email_sender_name else None,
            from_address=event.email_sender_address if event and event.email_sender_address else None,
            reply_to=event.reply_to if event else None,
        )
    )


def _load_form(repos: Repositories, form_id: str) -> SubmissionForm:
    form = repos.forms.get(form_id)
    if form is None:
        raise HTTPException(status_code=404, detail="Form not found")
    return form


def submission_window_state(form: SubmissionForm) -> tuple[bool, str | None]:
    """Whether the CFP is accepting submissions right now, and why not.

    The status flag alone was the only gate, so a form whose close date had
    passed kept accepting proposals until someone remembered to close it by
    hand. The configured window is now authoritative.
    """
    if form.status == "closed":
        return False, "This call for papers is closed."
    if form.status == "draft":
        return False, "This call for papers is not open yet."
    now = utcnow()
    if form.open_at and now < form.open_at:
        return False, "This call for papers has not opened yet."
    if form.close_at and now > form.close_at:
        return False, "This call for papers closed on " + form.close_at.strftime("%d %b %Y") + "."
    return True, None


def create_draft(
    db: Session, repos: Repositories, user: User, form: SubmissionForm, payload: SubmissionWrite
) -> Submission:
    open_now, reason = submission_window_state(form)
    if not open_now:
        raise HTTPException(status_code=400, detail=reason)

    person = repos.people.upsert_by_email(user.email, {})
    user.person_id = person.id

    submission = repos.submissions.create(
        {
            "event_id": form.event_id,
            "form_id": form.id,
            "submitter_person_id": person.id,
            "status": "draft",
            "title": payload.title,
            "description": payload.description,
            "format_id": payload.format_id,
            "track_id": payload.track_id,
            "level": payload.level,
            "custom_answers_json": payload.custom_answers,
            "reference_code": _allocate_reference_code(db, repos, form.event_id),
            "capacity": payload.capacity,
            "ceu_credits": payload.ceu_credits,
            "client_session_id": payload.client_session_id,
            "starts_at": payload.starts_at,
            "ends_at": payload.ends_at,
            "language": payload.language,
        }
    )
    set_tracks(db, repos, submission, payload.track_ids)
    _set_participants(db, repos, submission.id, _with_submitter(form, person, payload.participants))
    db.commit()
    return submission


def update_draft(
    db: Session,
    repos: Repositories,
    submission: Submission,
    payload: SubmissionWrite,
    form: SubmissionForm | None = None,
) -> Submission:
    if submission.status != "draft":
        raise HTTPException(status_code=409, detail="Only drafts can be edited.")
    _apply_payload(submission, payload, db, repos)
    # The wizard resends the whole participant list on every step, so the
    # submitter has to be re-seeded here too or the first save drops them.
    _set_participants(db, repos, submission.id, _submitter_first(repos, submission, payload.participants, form))
    db.commit()
    return submission


def submit(
    db: Session, repos: Repositories, form: SubmissionForm, submission: Submission, payload: SubmissionWrite
) -> Submission:
    open_now, reason = submission_window_state(form)
    if not open_now:
        raise HTTPException(status_code=400, detail=reason)
    if submission.status != "draft":
        raise HTTPException(status_code=409, detail="This submission has already been submitted.")

    _apply_payload(submission, payload, db, repos)
    _set_participants(db, repos, submission.id, _submitter_first(repos, submission, payload.participants, form))

    errors = validate_submission(form, submission, repos)
    if errors:
        raise HTTPException(status_code=400, detail=errors)

    if form.submission_limit and submission.submitter_person_id:
        count = repos.submissions.count_submitted_by_form(form.id, submission.submitter_person_id)
        if count >= form.submission_limit:
            raise HTTPException(
                status_code=400, detail=f"Submission limit of {form.submission_limit} reached for this form."
            )

    effects = apply_routing(_to_answers(submission), form.routing_rules_json or [])
    if effects.get("track_id"):
        submission.track_id = effects["track_id"]
    tags = set(submission.tags_json or [])
    tags.update(effects.get("tags", []))
    submission.tags_json = sorted(tags)
    if effects.get("owner_person_id"):
        submission.owner_person_id = effects["owner_person_id"]
    if effects.get("evaluation_plan_id"):
        submission.planned_evaluation_plan_id = effects["evaluation_plan_id"]

    submission.status = "submitted"
    submission.submitted_at = utcnow()

    _send_confirmation(form, submission, repos)
    db.add(
        EmailJobReceipt(
            job_type="submission_confirmation",
            dedupe_key=f"subm:{submission.id}",
            status="sent",
            processed_at=utcnow(),
        )
    )
    db.add(
        AuditEvent(
            event_id=form.event_id,
            action="submission.submitted",
            payload={"submission_id": submission.id, "form_id": form.id},
        )
    )
    db.commit()
    return submission


def all_track_ids(repos: Repositories, submission: Submission) -> list[str]:
    """Primary track first, then any extras. Empty when no track is set at all."""
    extras = [row.track_id for row in repos.submission_tracks.list_for_submission(submission.id)]
    if submission.track_id:
        return [submission.track_id, *[t for t in extras if t != submission.track_id]]
    return extras


def set_tracks(db: Session, repos: Repositories, submission: Submission, track_ids: list[str] | None) -> None:
    """Store a multi-track selection.

    The first entry becomes `track_id` so every existing reader — exports, the
    agenda's track view, track pills — keeps working untouched; the rest go to
    the join table. `None` means "not supplied", which leaves tracks alone.
    """
    if track_ids is None:
        return
    cleaned: list[str] = []
    for track_id in track_ids:
        if track_id and track_id not in cleaned:
            cleaned.append(track_id)
    submission.track_id = cleaned[0] if cleaned else None
    repos.submission_tracks.set_for_submission(submission.id, cleaned[1:])
    db.flush()


def to_read(repos: Repositories, submission: Submission) -> SubmissionRead:
    participants: list[ParticipantRead] = []
    for participant in repos.submission_participants.list_for_submission(submission.id):
        person = repos.people.get(participant.person_id)
        participants.append(
            ParticipantRead(
                id=participant.id,
                person_id=participant.person_id,
                role=participant.role,
                sort_order=participant.sort_order,
                email=person.primary_email if person else "",
                first_name=person.first_name if person else None,
                last_name=person.last_name if person else None,
                company=person.company if person else None,
                job_title=person.job_title if person else None,
                bio=person.bio if person else None,
            )
        )
    form = repos.forms.get(submission.form_id) if submission.form_id else None
    can_edit, edit_lock_reason = speaker_can_edit(form, submission)
    return SubmissionRead(
        id=submission.id,
        event_id=submission.event_id,
        form_id=submission.form_id,
        submitter_person_id=submission.submitter_person_id,
        status=submission.status,
        title=submission.title,
        description=submission.description,
        track_id=submission.track_id,
        track_ids=all_track_ids(repos, submission),
        format_id=submission.format_id,
        level=submission.level,
        capacity=submission.capacity,
        ceu_credits=submission.ceu_credits,
        client_session_id=submission.client_session_id,
        starts_at=submission.starts_at,
        ends_at=submission.ends_at,
        language=submission.language,
        reference_code=submission.reference_code,
        custom_answers=submission.custom_answers_json or {},
        tags=submission.tags_json or [],
        owner_person_id=submission.owner_person_id,
        aggregate_rating=submission.aggregate_rating,
        notified=submission.notified,
        submitted_at=submission.submitted_at,
        created_at=submission.created_at,
        updated_at=submission.updated_at,
        participants=participants,
        review_summary=evaluation_service.aggregate_for_submission(repos, submission.id),
        can_edit=can_edit,
        edit_lock_reason=edit_lock_reason,
    )


def redact_for_blind_review(read: SubmissionRead) -> SubmissionRead:
    """Strip speaker identity/company from a submission view (§11.2 Privacy: blind review).

    Applied to the reviewer-facing submission detail when the covering evaluation
    plan has blind_review enabled. Names/emails/company/job title/bio are replaced
    with a stable anonymous label per participant; the proposal content is untouched.
    """
    redacted_participants = [
        p.model_copy(
            update={
                "person_id": f"redacted-{p.sort_order + 1}",
                "first_name": f"{p.role.title()}",
                "last_name": f"#{p.sort_order + 1}",
                "email": f"redacted-{p.sort_order + 1}@blind-review.invalid",
                "company": None,
                "job_title": None,
                "bio": None,
            }
        )
        for p in read.participants
    ]
    return read.model_copy(update={"submitter_person_id": None, "participants": redacted_participants})


def create_manual(db: Session, repos: Repositories, event_id: str, payload) -> Submission:
    """Manual abstract/session (§10.2)."""
    form_id = payload.form_id
    if form_id and repos.forms.get(form_id) is None:
        raise HTTPException(status_code=400, detail="Form not found.")

    submission = repos.submissions.create(
        {
            "event_id": event_id,
            "form_id": form_id,
            "submitter_person_id": None,
            "status": payload.status or "submitted",
            "title": payload.title,
            "description": payload.description,
            "track_id": payload.track_id,
            "format_id": payload.format_id,
            "level": payload.level,
            "custom_answers_json": payload.custom_answers or {},
            "tags_json": payload.tags or [],
            "reference_code": _allocate_reference_code(db, repos, event_id),
            "capacity": payload.capacity,
            "ceu_credits": payload.ceu_credits,
            "client_session_id": payload.client_session_id,
            "starts_at": payload.starts_at,
            "ends_at": payload.ends_at,
            "language": payload.language,
            "submitted_at": utcnow(),
        }
    )
    set_tracks(db, repos, submission, getattr(payload, "track_ids", None))
    _set_participants(db, repos, submission.id, payload.participants or [])
    db.add(
        AuditEvent(
            event_id=event_id,
            action="submission.created_manual",
            payload={"submission_id": submission.id},
        )
    )
    db.commit()
    return submission


def update_submission(db: Session, repos: Repositories, submission_id: str, payload) -> Submission:
    submission = repos.submissions.get(submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")

    data = payload.model_dump(exclude_unset=True, exclude={"custom_answers", "participants", "tags"})
    # `track_ids` is not a column — it is split across `track_id` plus the join
    # table by `set_tracks`, so it must not reach the generic attribute patch.
    track_ids = data.pop("track_ids", None)
    patch = {k: v for k, v in data.items() if v is not None and k != "form_id"}
    if "title" in data and data["title"]:
        patch["title"] = data["title"]
    if payload.custom_answers is not None:
        patch["custom_answers_json"] = payload.custom_answers
    if payload.tags is not None:
        patch["tags_json"] = payload.tags
    submission = repos.submissions.update(submission_id, patch)
    if track_ids is not None:
        set_tracks(db, repos, submission, track_ids)
    if payload.participants:
        _set_participants(db, repos, submission.id, payload.participants)
    db.commit()
    return submission


def speaker_can_edit(form: SubmissionForm | None, submission: Submission) -> tuple[bool, str | None]:
    """Return whether a speaker may edit a submission after acceptance."""
    if submission.status in {"withdrawn", "declined"}:
        return False, f"Submissions in {submission.status} status cannot be edited."
    if form and form.edit_locked_after and utcnow() > form.edit_locked_after:
        return False, "This submission is locked for edits."
    # Closing the call also closes editing. `edit_locked_after` stays available
    # for organizers who want editing to stop *earlier* than the CFP deadline.
    if form:
        open_now, reason = submission_window_state(form)
        if not open_now:
            return False, reason
    return True, None


def update_speaker_submission(
    db: Session,
    repos: Repositories,
    submission: Submission,
    payload: SubmissionWrite,
    *,
    actor_user_id: str,
    actor_person_id: str,
) -> Submission:
    form = repos.forms.get(submission.form_id) if submission.form_id else None
    allowed, reason = speaker_can_edit(form, submission)
    if not allowed:
        raise HTTPException(status_code=409, detail=reason)

    before = {
        "title": submission.title,
        "description": submission.description,
        "format_id": submission.format_id,
        "track_id": submission.track_id,
        "level": submission.level,
        "capacity": submission.capacity,
        "ceu_credits": submission.ceu_credits,
        "client_session_id": submission.client_session_id,
        "starts_at": submission.starts_at,
        "ends_at": submission.ends_at,
        "language": submission.language,
        "custom_answers": submission.custom_answers_json,
    }
    _apply_payload(submission, payload, db, repos)
    if payload.participants:
        _set_participants(db, repos, submission.id, payload.participants)
    if form:
        errors = validate_submission(form, submission, repos)
        if errors:
            raise HTTPException(status_code=400, detail=errors)

    after = {
        "title": submission.title,
        "description": submission.description,
        "format_id": submission.format_id,
        "track_id": submission.track_id,
        "level": submission.level,
        "capacity": submission.capacity,
        "ceu_credits": submission.ceu_credits,
        "client_session_id": submission.client_session_id,
        "starts_at": submission.starts_at,
        "ends_at": submission.ends_at,
        "language": submission.language,
        "custom_answers": submission.custom_answers_json,
    }
    changed_fields = [key for key in before if before[key] != after[key]]
    db.add(
        SubmissionEvent(
            submission_id=submission.id,
            actor_user_id=actor_user_id,
            actor_person_id=actor_person_id,
            action="speaker_updated",
            changed_fields_json=changed_fields,
        )
    )
    db.commit()
    return submission


def list_submission_events(db: Session, submission_id: str) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(SubmissionEvent)
        .where(SubmissionEvent.submission_id == submission_id)
        .order_by(SubmissionEvent.created_at.desc())
    )
    return [
        {
            "id": row.id,
            "action": row.action,
            "actor_user_id": row.actor_user_id,
            "actor_person_id": row.actor_person_id,
            "changed_fields": row.changed_fields_json or [],
            "created_at": row.created_at,
        }
        for row in rows
    ]


def decision(
    db: Session,
    repos: Repositories,
    event: Event,
    submission: Submission,
    target: str,
    notify: bool = True,
    message: str | None = None,
) -> Submission:
    if target not in SUBMISSION_DECISIONS:
        raise HTTPException(status_code=400, detail="Invalid decision.")
    allowed = _ALLOWED_TRANSITIONS.get(submission.status, set())
    if target not in allowed:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot move submission from {submission.status!r} to {target!r}.",
        )

    submission.status = target
    submitter = repos.people.get(submission.submitter_person_id) if submission.submitter_person_id else None

    if target == "accepted":
        _accept(db, repos, event, submission, message=message if notify else None)
    elif target == "declined" and notify:
        _decline_notify(db, repos, event, submission, submitter, message=message)

    db.add(
        AuditEvent(
            event_id=event.id,
            action=f"submission.{target}",
            payload={"submission_id": submission.id},
        )
    )
    db.commit()
    return submission


def _accept(
    db: Session, repos: Repositories, event: Event, submission: Submission, *, message: str | None = None
) -> None:
    """§10.3 Accept action: session, speakers, tasks, acceptance email."""
    session = session_service.create_from_submission(db, repos, event, submission)

    for participant in repos.submission_participants.list_for_submission(submission.id):
        repos.event_people.upsert(
            event.id, participant.person_id, {"speaker_status": "accepted", "confirmation_status": "unconfirmed"}
        )
        person = repos.people.get(participant.person_id)
        if person is not None:
            user = db.scalar(select(User).where(User.email == person.primary_email))
            if user is None:
                user = User(email=person.primary_email, person_id=person.id)
                db.add(user)
                db.flush()
            elif user.person_id is None:
                user.person_id = person.id
            binding = db.scalar(
                select(RoleBinding).where(
                    RoleBinding.user_id == user.id,
                    RoleBinding.event_id == event.id,
                    RoleBinding.role == "speaker",
                )
            )
            if binding is None:
                db.add(RoleBinding(user_id=user.id, event_id=event.id, role="speaker"))
        task_service.generate_assignments(
            db, repos, event.id, participant.person_id, session_id=session.id, submission_id=submission.id
        )

    for person in _notify_recipients(repos, submission):
        communication_service.send_automated(
            db,
            repos,
            event.id,
            "submission_accepted",
            person.id,
            person.primary_email,
            _speaker_context(event, person, submission, message),
            related_submission_id=submission.id,
            related_session_id=session.id,
        )


def _decline_notify(
    db: Session, repos: Repositories, event: Event, submission: Submission, submitter, *, message: str | None = None
) -> None:
    for person in _notify_recipients(repos, submission):
        communication_service.send_automated(
            db,
            repos,
            event.id,
            "submission_declined",
            person.id,
            person.primary_email,
            _speaker_context(event, person, submission, message),
            related_submission_id=submission.id,
        )


def _notify_recipients(repos: Repositories, submission: Submission) -> list[Any]:
    """Everyone who should hear about a decision, submitter first.

    Not just the submitter: an organizer-entered abstract has no submitter at
    all, so keying the acceptance email off `submitter_person_id` meant the
    speaker on a manually added talk was never told they were accepted. Co-
    presenters were silently skipped for the same reason.
    """
    people: list[Any] = []
    seen: set[str] = set()

    def _add(person_id: str | None) -> None:
        if not person_id or person_id in seen:
            return
        person = repos.people.get(person_id)
        if person is None:
            return
        seen.add(person_id)
        people.append(person)

    _add(submission.submitter_person_id)
    for participant in repos.submission_participants.list_for_submission(submission.id):
        _add(participant.person_id)
    return people


def _speaker_context(
    event: Event, person, submission: Submission, organizer_message: str | None = None
) -> dict[str, Any]:
    return {
        # Pre-rendered because the template engine is plain token substitution with
        # no conditionals — an absent note has to collapse to an empty string here
        # rather than leave an empty quote block in the email.
        "organizer_message": organizer_message or "",
        "organizer_message_html": _organizer_message_html(organizer_message),
        "speaker": {
            "first_name": person.first_name or "",
            "full_name": " ".join(filter(None, [person.first_name, person.last_name])),
        },
        "event": {"name": event.name, "start_date": event.starts_at.isoformat() if event.starts_at else ""},
        "submission": {"title": submission.title or ""},
        "portal_url": "",
    }


def _organizer_message_html(message: str | None) -> str:
    if not message or not message.strip():
        return ""
    body = "".join(
        f'<p style="margin:0 0 8px">{html_escape(line)}</p>' for line in message.strip().splitlines() if line.strip()
    )
    return (
        '<div style="margin:20px 0 0;padding:16px 18px;border-left:4px solid #8d9bd2;background:#f5f6fa">'
        '<p style="margin:0 0 9px;color:#202534;font-size:13px;font-weight:700">A note from the organizers</p>'
        f"{body}</div>"
    )


def bulk_decision(
    db: Session,
    repos: Repositories,
    event: Event,
    submission_ids: list[str],
    target: str,
    notify: bool = True,
    message: str | None = None,
) -> dict[str, int]:
    updated = 0
    for submission_id in submission_ids:
        submission = repos.submissions.get(submission_id)
        if submission is None or submission.event_id != event.id:
            continue
        try:
            decision(db, repos, event, submission, target, notify=notify, message=message)
            updated += 1
        except HTTPException:
            continue
    db.commit()
    return {"updated": updated}
