from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_principal, get_repos, require_event_role, require_session_role
from app.core.db import get_db
from app.email.ics import build_ics
from app.repositories import Repositories
from app.schemas.ops import ScheduleRequest, SessionCreate, SessionImportCommit, SessionUpdate
from app.services import agenda_service, calendar_service, communication_service, session_service

router = APIRouter(prefix="/api/v1", tags=["sessions"])


def _session_view(repos: Repositories, session) -> dict:
    participants = []
    for participant in repos.session_participants.list_for_session(session.id):
        person = repos.people.get(participant.person_id)
        participants.append(
            {
                "person_id": participant.person_id,
                "role": participant.role,
                "sort_order": participant.sort_order,
                "email": person.primary_email if person else "",
                "first_name": person.first_name if person else None,
                "last_name": person.last_name if person else None,
                "company": person.company if person else None,
                "job_title": person.job_title if person else None,
            }
        )
    room = repos.rooms.get(session.room_id) if session.room_id else None
    return {
        "id": session.id,
        "event_id": session.event_id,
        "source_submission_id": session.source_submission_id,
        "title": session.title,
        "description": session.description,
        "status": session.status,
        "approval_status": session.approval_status,
        "track_id": session.track_id,
        "format_id": session.format_id,
        "duration_minutes": session.duration_minutes,
        "capacity": session.capacity,
        "ceu_credits": session.ceu_credits,
        "chairperson": session.chairperson,
        "language": session.language,
        "location": session.location,
        "room_id": session.room_id,
        "room_name": room.name if room else None,
        "starts_at": session.starts_at,
        "ends_at": session.ends_at,
        "calendar_sequence": session.calendar_sequence,
        "participants": participants,
    }


@router.get("/events/{event_id}/sessions")
def list_sessions(
    event_id: str = Depends(require_event_role("owner", "admin", scope="sessions:write")),
    status: str | None = Query(default=None),
    track_id: str | None = Query(default=None),
    room_id: str | None = Query(default=None),
    unscheduled: bool = Query(default=False),
    repos: Repositories = Depends(get_repos),
) -> list[dict]:
    filters = {"status": status, "track_id": track_id, "room_id": room_id, "unscheduled": unscheduled or None}
    sessions = repos.sessions.list_by_event(event_id, {k: v for k, v in filters.items() if v})
    return [_session_view(repos, s) for s in sessions]


@router.post("/events/{event_id}/sessions", status_code=201)
def create_session(
    body: SessionCreate,
    event_id: str = Depends(require_event_role("owner", "admin", scope="sessions:write")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    session = session_service.create_manual(db, repos, event_id, body)
    return _session_view(repos, session)


@router.post("/events/{event_id}/sessions/import/preview")
async def preview_session_import(
    event_id: str = Depends(require_event_role("owner", "admin")),
    file: UploadFile = File(...),
    repos: Repositories = Depends(get_repos),
):
    content = await file.read()
    return session_service.preview_session_import(repos, event_id, content)


@router.post("/events/{event_id}/sessions/import/commit")
def commit_session_import(
    body: SessionImportCommit,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    created = session_service.commit_session_import(db, repos, event_id, body.rows, body.mapping)
    return {"created_ids": [session.id for session in created], "count": len(created), "errors": []}


@router.get("/sessions/{session_id}")
def get_session(
    session_id: str = Depends(require_session_role("owner", "admin", scope="sessions:write")),
    repos: Repositories = Depends(get_repos),
):
    return _session_view(repos, repos.sessions.get(session_id))


@router.patch("/sessions/{session_id}")
def update_session(
    body: SessionUpdate,
    session_id: str = Depends(require_session_role("owner", "admin", scope="sessions:write")),
    principal=Depends(get_principal),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    patch = body.model_dump(exclude_unset=True)
    session = session_service.update_session(
        db, repos, session_id, patch, editor_name=_editor_name(repos, principal), editor_person_id=_editor_id(principal)
    )
    calendar_service.sync_session_connections(db, repos, session)
    return _session_view(repos, session)


@router.get("/sessions/{session_id}/revisions")
def list_session_revisions(
    session_id: str = Depends(require_session_role("owner", "admin")),
    db: Session = Depends(get_db),
):
    """Change history with editor attribution and timestamps (CNT-11)."""
    from app.models.schedule import SessionRevision

    rows = (
        db.query(SessionRevision)
        .filter(SessionRevision.session_id == session_id)
        .order_by(SessionRevision.created_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "editor_name": r.editor_name,
            "changed_fields": r.changed_fields_json,
            "snapshot": r.snapshot_json,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.post("/sessions/{session_id}/revisions/{revision_id}/restore")
def restore_session_revision(
    revision_id: str,
    session_id: str = Depends(require_session_role("owner", "admin", scope="sessions:write")),
    principal=Depends(get_principal),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    session = session_service.restore_session_revision(
        db, repos, session_id, revision_id, editor_name=_editor_name(repos, principal)
    )
    calendar_service.sync_session_connections(db, repos, session)
    return _session_view(repos, session)


def _editor_id(principal) -> str | None:
    return principal.user.person_id if getattr(principal, "kind", None) == "user" and principal.user else None


def _editor_name(repos: Repositories, principal) -> str:
    person_id = _editor_id(principal)
    person = repos.people.get(person_id) if person_id else None
    if person is None:
        return "Organizer"
    return " ".join(filter(None, [person.first_name, person.last_name])) or person.primary_email


@router.patch("/sessions/{session_id}/schedule")
def schedule_session(
    body: ScheduleRequest,
    session_id: str = Depends(require_session_role("owner", "admin", scope="sessions:write")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    session = repos.sessions.get(session_id)
    event = repos.events.get(session.event_id)
    scheduled = session_service.schedule(
        db,
        repos,
        event,
        session,
        room_id=body.room_id,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        allow_soft=body.allow_soft,
    )
    room = repos.rooms.get(scheduled.room_id) if scheduled.room_id else None
    context = {
        "session": {
            "title": scheduled.title,
            "start_time": scheduled.starts_at.strftime("%Y-%m-%d %H:%M"),
            "end_time": scheduled.ends_at.strftime("%Y-%m-%d %H:%M"),
            "room": room.name if room else "TBD",
        },
        "event": {"name": event.name},
    }
    trigger = "session_schedule_changed" if session.status == "scheduled" else "session_scheduled"
    attendees = []
    for participant in repos.session_participants.list_for_session(scheduled.id):
        person = repos.people.get(participant.person_id)
        if person:
            attendees.append(person.primary_email)
    ics = build_ics(
        uid=scheduled.calendar_uid or scheduled.id,
        summary=scheduled.title,
        start=scheduled.starts_at,
        end=scheduled.ends_at,
        location=room.name if room else None,
        description=scheduled.description,
        sequence=scheduled.calendar_sequence or 0,
    )
    for participant in repos.session_participants.list_for_session(scheduled.id):
        person = repos.people.get(participant.person_id)
        if person:
            communication_service.send_automated(
                db,
                repos,
                event.id,
                trigger,
                person.id,
                person.primary_email,
                context,
                related_session_id=scheduled.id,
                include_ics=ics,
            )
    calendar_service.sync_session_connections(db, repos, scheduled)
    return _session_view(repos, scheduled)


@router.get("/events/{event_id}/agenda")
def get_agenda(
    event_id: str = Depends(require_event_role("owner", "admin", scope="agenda:read")),
    repos: Repositories = Depends(get_repos),
) -> list[dict]:
    return agenda_service.agenda(repos, event_id)


@router.post("/events/{event_id}/agenda/publish")
def publish_agenda(
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    """Go live: mark the event's agenda published and approve scheduled sessions.

    Publishing is what hands the schedule to the public widgets, so it also
    clears the content-approval gate for anything actually on the calendar —
    an organizer who has placed a session has, in practice, approved it.
    """
    return session_service.publish_agenda(db, repos, event_id)


@router.post("/events/{event_id}/agenda/auto-schedule")
def auto_schedule(
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    """Place every unscheduled session into the first slot that fits."""
    result = session_service.auto_schedule(db, repos, event_id)
    for session in repos.sessions.list_scheduled(event_id):
        calendar_service.sync_session_connections(db, repos, session)
    return result


@router.get("/events/{event_id}/conflicts")
def get_conflicts(
    event_id: str = Depends(require_event_role("owner", "admin", scope="agenda:read")),
    repos: Repositories = Depends(get_repos),
) -> list[dict]:
    event = repos.events.get(event_id)
    return agenda_service.conflicts(repos, event)
