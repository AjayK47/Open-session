import csv
import io
from datetime import UTC, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.models.cfp import Submission
from app.models.program import Event
from app.models.schedule import ProgramSession, SessionRevision
from app.repositories import Repositories
from app.rules.engine import detect_conflicts

IMPORT_COLUMNS = (
    "title",
    "description",
    "track",
    "format",
    "room",
    "starts_at",
    "ends_at",
    "duration_minutes",
    "capacity",
    "ceu_credits",
    "language",
    "location",
)


def preview_session_import(repos: Repositories, event_id: str, content: bytes) -> dict[str, Any]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    headers = [header or "" for header in (reader.fieldnames or [])]
    mapping = {column: next((h for h in headers if h.strip().lower() == column), "") for column in IMPORT_COLUMNS}
    rows = []
    for row_number, raw in enumerate(reader, start=2):
        values = {key: (value or "").strip() for key, value in raw.items() if key}
        errors = _validate_import_row(repos, event_id, values)
        rows.append({"row_number": row_number, "values": values, "errors": errors})
    return {
        "headers": headers,
        "mapping": mapping,
        "rows": rows,
        "total_rows": len(rows),
        "valid_rows": sum(1 for row in rows if not row["errors"]),
    }


def commit_session_import(
    db: Session, repos: Repositories, event_id: str, rows: list[dict], mapping: dict[str, str] | None = None
) -> list[ProgramSession]:
    mapping = mapping or {}
    normalized_rows = []
    for row in rows:
        normalized_rows.append(
            {canonical: row.get(source, row.get(canonical, "")) for canonical, source in mapping.items()}
            | {key: value for key, value in row.items() if key in IMPORT_COLUMNS and key not in mapping}
        )
    rows = normalized_rows
    errors = []
    for index, row in enumerate(rows, start=1):
        row_errors = _validate_import_row(repos, event_id, row)
        if row_errors:
            errors.append({"row_number": index, "errors": row_errors})
    if errors:
        raise HTTPException(status_code=400, detail={"rows": errors})

    created = []
    for row in rows:
        track = _by_name(repos.tracks.list_by_event(event_id), row.get("track"))
        fmt = _by_name(repos.formats.list_by_event(event_id), row.get("format"))
        room = _by_name(repos.rooms.list_by_event(event_id), row.get("room"))
        starts_at = _parse_datetime(row.get("starts_at"))
        ends_at = _parse_datetime(row.get("ends_at"))
        created.append(
            repos.sessions.create(
                {
                    "event_id": event_id,
                    "title": row["title"].strip(),
                    "description": row.get("description") or None,
                    "track_id": track.id if track else None,
                    "format_id": fmt.id if fmt else None,
                    "room_id": room.id if room else None,
                    "starts_at": starts_at,
                    "ends_at": ends_at,
                    "duration_minutes": int(row["duration_minutes"]) if row.get("duration_minutes") else None,
                    "capacity": int(row["capacity"]) if row.get("capacity") else None,
                    "ceu_credits": float(row["ceu_credits"]) if row.get("ceu_credits") else None,
                    "language": row.get("language") or None,
                    "location": row.get("location") or None,
                    "status": "scheduled" if starts_at and ends_at else "confirmed",
                }
            )
        )
    db.commit()
    return created


def _by_name(items, value):
    if not value:
        return None
    lowered = value.strip().casefold()
    return next((item for item in items if item.name.casefold() == lowered), None)


def _parse_datetime(value: str | None):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _validate_import_row(repos: Repositories, event_id: str, row: dict) -> list[str]:
    errors = []
    if not row.get("title", "").strip():
        errors.append("title is required")
    if row.get("track") and _by_name(repos.tracks.list_by_event(event_id), row["track"]) is None:
        errors.append(f"unknown track: {row['track']}")
    if row.get("format") and _by_name(repos.formats.list_by_event(event_id), row["format"]) is None:
        errors.append(f"unknown format: {row['format']}")
    if row.get("room") and _by_name(repos.rooms.list_by_event(event_id), row["room"]) is None:
        errors.append(f"unknown room: {row['room']}")
    try:
        starts_at = _parse_datetime(row.get("starts_at"))
        ends_at = _parse_datetime(row.get("ends_at"))
        if starts_at and ends_at and ends_at <= starts_at:
            errors.append("ends_at must be after starts_at")
    except ValueError:
        errors.append("invalid datetime")
    for field in ("duration_minutes", "capacity"):
        if row.get(field):
            try:
                if int(row[field]) < 0:
                    errors.append(f"{field} must be non-negative")
            except ValueError:
                errors.append(f"{field} must be an integer")
    if row.get("ceu_credits"):
        try:
            if float(row["ceu_credits"]) < 0:
                errors.append("ceu_credits must be non-negative")
        except ValueError:
            errors.append("ceu_credits must be a number")
    return errors


def _session_dict(repos: Repositories, session: ProgramSession, track_serial: bool = False) -> dict[str, Any]:
    participants = repos.session_participants.list_for_session(session.id)
    return {
        "id": session.id,
        "room_id": session.room_id,
        "track_id": session.track_id,
        "starts_at": session.starts_at,
        "ends_at": session.ends_at,
        "participant_person_ids": [p.person_id for p in participants],
        "track_serial": track_serial,
    }


def conflicts_for(
    repos: Repositories,
    event: Event,
    session: ProgramSession,
    new_room_id: str | None,
    new_start,
    new_end,
) -> list[dict]:
    """Conflicts for a candidate session placement against all scheduled sessions.

    The candidate is included even if it is not yet scheduled.
    """
    candidate_track = repos.tracks.get(session.track_id) if session.track_id else None
    candidate = _session_dict(repos, session, candidate_track.serial_schedule if candidate_track else False)
    candidate["room_id"] = new_room_id
    candidate["starts_at"] = new_start
    candidate["ends_at"] = new_end

    sessions = [candidate]
    for s in repos.sessions.list_scheduled(event.id):
        if s.id == session.id:
            continue
        track = repos.tracks.get(s.track_id) if s.track_id else None
        sessions.append(_session_dict(repos, s, track.serial_schedule if track else False))
    return detect_conflicts(sessions, event_start=event.starts_at, event_end=event.ends_at)


def relevant_conflicts(
    repos: Repositories, event: Event, session: ProgramSession, room_id, starts_at, ends_at
) -> list[dict]:
    """Conflicts (hard and soft) that involve this candidate placement."""
    return [c for c in conflicts_for(repos, event, session, room_id, starts_at, ends_at) if session.id in c["sessions"]]


def list_sessions(repos: Repositories, event_id: str, filters: dict | None = None) -> list[ProgramSession]:
    return repos.sessions.list_by_event(event_id, filters)


def get_session(repos: Repositories, session_id: str) -> ProgramSession | None:
    return repos.sessions.get(session_id)


def create_manual(db: Session, repos: Repositories, event_id: str, payload) -> ProgramSession:
    session = repos.sessions.create(
        {
            "event_id": event_id,
            "title": payload.title,
            "description": payload.description,
            "track_id": payload.track_id,
            "format_id": payload.format_id,
            "duration_minutes": payload.duration_minutes,
            "capacity": payload.capacity,
            "ceu_credits": payload.ceu_credits,
            "chairperson": payload.chairperson,
            "language": payload.language,
            "location": payload.location,
            "status": "confirmed",
        }
    )
    _set_participants(db, repos, session.id, payload.participants or [])
    db.commit()
    return session


def _set_participants(db: Session, repos: Repositories, session_id: str, participants: list) -> None:
    repos.session_participants.delete_for_session(session_id)
    for idx, participant in enumerate(participants):
        data = participant if isinstance(participant, dict) else participant.model_dump()
        person = repos.people.upsert_by_email(
            data["email"],
            {
                k: v
                for k, v in {
                    "first_name": data.get("first_name"),
                    "last_name": data.get("last_name"),
                    "company": data.get("company"),
                    "job_title": data.get("job_title"),
                }.items()
                if v is not None
            },
        )
        repos.session_participants.create(
            session_id, {"person_id": person.id, "role": data.get("role", "speaker"), "sort_order": idx}
        )


def create_from_submission(db: Session, repos: Repositories, event: Event, submission: Submission) -> ProgramSession:
    existing = repos.sessions.get_by_submission(submission.id)
    if existing:
        return existing

    duration = None
    if submission.format_id:
        fmt = repos.formats.get(submission.format_id)
        duration = fmt.default_duration_minutes if fmt else None

    session = repos.sessions.create(
        {
            "event_id": event.id,
            "source_submission_id": submission.id,
            "title": submission.title or "Untitled session",
            "description": submission.description,
            "track_id": submission.track_id,
            "format_id": submission.format_id,
            "duration_minutes": duration,
            "capacity": submission.capacity,
            "ceu_credits": submission.ceu_credits,
            "language": submission.language,
            "location": None,
            "status": "confirmed",
        }
    )
    for idx, participant in enumerate(repos.submission_participants.list_for_submission(submission.id)):
        repos.session_participants.create(
            session.id,
            {"person_id": participant.person_id, "role": participant.role, "sort_order": idx},
        )
    db.commit()
    return session


#: Fields whose edits are worth keeping history for. Scheduling moves are noisy
#: and already visible on the agenda, so they are deliberately excluded.
TRACKED_SESSION_FIELDS = ("title", "description", "track_id", "format_id", "language", "location", "chairperson")


def update_session(
    db: Session,
    repos: Repositories,
    session_id: str,
    patch: dict,
    editor_name: str = "Organizer",
    editor_person_id: str | None = None,
) -> ProgramSession:
    session = repos.sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    participants = patch.pop("participants", None)
    # Snapshot the *previous* values before applying, so a revision can be
    # restored by re-applying it (CNT-11).
    changed = [f for f in TRACKED_SESSION_FIELDS if f in patch and getattr(session, f) != patch[f]]
    if changed:
        db.add(
            SessionRevision(
                session_id=session.id,
                editor_person_id=editor_person_id,
                editor_name=editor_name,
                changed_fields_json=changed,
                snapshot_json={f: getattr(session, f) for f in TRACKED_SESSION_FIELDS},
            )
        )

    session = repos.sessions.update(session_id, patch)
    if participants is not None:
        _set_participants(db, repos, session.id, participants)
    db.commit()
    return session


def restore_session_revision(
    db: Session, repos: Repositories, session_id: str, revision_id: str, editor_name: str = "Organizer"
) -> ProgramSession:
    """Re-apply a stored snapshot, itself recorded as a new revision."""
    revision = db.get(SessionRevision, revision_id)
    if revision is None or revision.session_id != session_id:
        raise HTTPException(status_code=404, detail="Revision not found")
    return update_session(db, repos, session_id, dict(revision.snapshot_json or {}), editor_name=editor_name)


def schedule(
    db: Session,
    repos: Repositories,
    event: Event,
    session: ProgramSession,
    *,
    room_id: str | None,
    starts_at: datetime,
    ends_at: datetime,
    allow_soft: bool = False,
) -> ProgramSession:
    if ends_at <= starts_at:
        raise HTTPException(status_code=400, detail="End time must be after start time.")

    conflicts = relevant_conflicts(repos, event, session, room_id, starts_at, ends_at)
    hard = [c for c in conflicts if c["severity"] == "hard"]
    soft = [c for c in conflicts if c["severity"] == "soft"]

    # Hard conflicts (room/speaker collisions, event-boundary, invalid duration) can
    # never be overridden. Soft conflicts (e.g. a serial track double-booked) can be
    # saved anyway when the caller explicitly opts in via allow_soft (§19.7).
    if hard:
        detail = "; ".join(c["detail"] for c in hard[:3])
        raise HTTPException(status_code=409, detail=f"Schedule conflict: {detail}")
    if soft and not allow_soft:
        detail = "; ".join(c["detail"] for c in soft[:3])
        raise HTTPException(status_code=409, detail=f"Schedule conflict: {detail}")

    session.room_id = room_id
    session.starts_at = starts_at
    session.ends_at = ends_at
    session.status = "scheduled"
    if not session.calendar_uid:
        session.calendar_uid = f"{session.id}@open-session.local"
    session.calendar_sequence = (session.calendar_sequence or 0) + 1
    db.commit()
    return session


def publish_agenda(db: Session, repos: Repositories, event_id: str) -> dict[str, Any]:
    """Mark the agenda live. Scheduling is not the same decision as approving.

    Publishing is the handoff to the public widgets (AIA-07), but it must not
    silently override the organizer's content-approval calls (CNT-12): a
    session left "Pending review" or flagged "Changes required" has to stay
    off the public widgets even after it's scheduled and the agenda is
    published, otherwise approval_status is decorative. This previously
    force-set every scheduled session to "approved" here, which is exactly
    the bug that let an unapproved session leak onto the public agenda.
    Publishing only flips session.status; approval stays a separate,
    deliberate action on each session.
    """
    event = repos.events.get(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")

    published = 0
    for session in repos.sessions.list_by_event(event_id):
        if session.starts_at is None or session.status == "cancelled":
            continue
        if session.status in ("draft", "confirmed", "scheduled"):
            session.status = "published"
        published += 1

    event.agenda_published_at = utcnow()
    db.commit()
    return {
        "published_sessions": published,
        "agenda_published_at": event.agenda_published_at,
        "public_url": f"/e/{event.slug}/agenda",
    }


def _event_zone(event: Event) -> ZoneInfo:
    """The event's timezone, falling back to UTC rather than failing a schedule."""
    try:
        return ZoneInfo(event.timezone or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _as_utc(value: datetime) -> datetime:
    """SQLite hands back naive datetimes; everything stored is UTC by convention."""
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def auto_schedule(db: Session, repos: Repositories, event_id: str) -> dict[str, Any]:
    """Place every unscheduled session into the first slot that raises no hard conflict.

    Deliberately simple and greedy — it walks day by day, room by room, and takes
    the first opening. That is enough to satisfy "one action places unscheduled
    sessions" without pretending to be an optimiser: anything it places can then
    be dragged, and anything it cannot place is reported rather than forced.
    """
    event = repos.events.get(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    if not event.starts_at or not event.ends_at:
        raise HTTPException(status_code=400, detail="Set the event start and end dates first.")

    rooms = repos.rooms.list_by_event(event_id)
    if not rooms:
        raise HTTPException(status_code=400, detail="Add at least one room before auto-scheduling.")

    unscheduled = [s for s in repos.sessions.list_by_event(event_id) if s.starts_at is None]
    placed, skipped = 0, 0

    # 08:00–18:00 local wall clock, in 30-minute steps, for each event day.
    # "Local" means the *event's* timezone: building the slots in UTC would put a
    # San Francisco conference's first session at midnight.
    tz = _event_zone(event)
    first_day = _as_utc(event.starts_at).astimezone(tz).date()
    last_day = _as_utc(event.ends_at).astimezone(tz).date()
    day_count = max(1, (last_day - first_day).days + 1)

    for session in unscheduled:
        duration = session.duration_minutes or 30
        slot_found = False
        for day in range(day_count):
            if slot_found:
                break
            local_base = datetime.combine(first_day + timedelta(days=day), time(hour=8), tzinfo=tz)
            base = local_base.astimezone(UTC)
            for step in range(0, 20):
                if slot_found:
                    break
                starts = base + timedelta(minutes=30 * step)
                ends = starts + timedelta(minutes=duration)
                for room in rooms:
                    try:
                        schedule(
                            db, repos, event, session, room_id=room.id, starts_at=starts, ends_at=ends
                        )
                    except HTTPException:
                        continue  # conflict — try the next room, then the next slot
                    placed += 1
                    slot_found = True
                    break
        if not slot_found:
            skipped += 1

    db.commit()
    return {"placed": placed, "skipped": skipped, "unscheduled_before": len(unscheduled)}
