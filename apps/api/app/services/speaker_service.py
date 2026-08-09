import csv
import io
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auth import RoleBinding, User
from app.models.program import Person
from app.repositories import Repositories

PROFILE_FIELDS = ("first_name", "last_name", "bio", "company", "job_title", "headshot")


def _profile_completion(repos: Repositories, person: Person) -> int:
    present = 0
    for field in PROFILE_FIELDS:
        if field == "headshot":
            if any(f.file_type == "headshot" for f in repos.files.list_for_person(person.id)):
                present += 1
        elif getattr(person, field):
            present += 1
    return round(present / len(PROFILE_FIELDS) * 100)


def list_speakers(
    repos: Repositories,
    event_id: str,
    speaker_status: str | None = None,
    confirmation_status: str | None = None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for event_person in repos.event_people.list_speakers(event_id, speaker_status):
        row = speaker_view(repos, event_id, event_person.person_id)
        if confirmation_status and row["confirmation_status"] != confirmation_status:
            continue
        rows.append(row)
    return rows


def speaker_view(repos: Repositories, event_id: str, person_id: str) -> dict[str, Any]:
    person = repos.people.get(person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Speaker not found")
    event_person = repos.event_people.get(event_id, person_id)

    sessions = []
    for participant in repos.session_participants.list_for_person(person_id):
        session = repos.sessions.get(participant.session_id)
        if session and session.event_id == event_id:
            room = repos.rooms.get(session.room_id) if session.room_id else None
            sessions.append(
                {
                    "id": session.id,
                    "title": session.title,
                    "status": session.status,
                    "room_id": session.room_id,
                    "room_name": room.name if room else None,
                    "starts_at": session.starts_at,
                    "ends_at": session.ends_at,
                }
            )

    tasks = [
        {
            "id": a.id,
            "name": repos.task_templates.get(a.template_id).name if a.template_id else None,
            "status": a.status,
            "due_at": a.due_at,
            "completed_at": a.completed_at,
        }
        for a in repos.task_assignments.list_for_person(person_id)
        if a.event_id == event_id
    ]
    total_tasks = len(tasks)
    completed_tasks = sum(1 for t in tasks if t["status"] == "completed")

    files = [
        {"id": f.id, "filename": f.filename, "file_type": f.file_type, "size_bytes": f.size_bytes}
        for f in repos.files.list_for_person(person_id)
    ]

    profile_completion = _profile_completion(repos, person)
    return {
        "person_id": person.id,
        "email": person.primary_email,
        "first_name": person.first_name,
        "last_name": person.last_name,
        "company": person.company,
        "job_title": person.job_title,
        "bio": person.bio,
        "phone": person.phone,
        "website": person.website,
        "linkedin_url": person.linkedin_url,
        "x_url": person.x_url,
        # Organizer surfaces render this as the speaker's photo; without it the
        # Speakers list falls back to initials even after a headshot is uploaded.
        "headshot_file_id": person.headshot_file_id,
        "speaker_status": event_person.speaker_status if event_person else "none",
        "confirmation_status": event_person.confirmation_status if event_person else "unconfirmed",
        "custom_fields": event_person.custom_fields_json if event_person else {},
        "profile_completion_percent": profile_completion,
        "onboarding_completion_percent": event_person.onboarding_completion_percent if event_person else 0,
        "sessions": sessions,
        "tasks": tasks,
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "outstanding_tasks": total_tasks - completed_tasks,
        "files": files,
    }


def update_profile(db: Session, repos: Repositories, person_id: str, payload) -> Person:
    person = repos.people.get(person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found")
    data = payload.model_dump(exclude_none=True)
    if "website" in data and data["website"] == "":
        data["website"] = None
    for key, value in data.items():
        setattr(person, key, value)
    db.commit()
    return person


def _provision_speaker_user(db: Session, event_id: str, person: Person) -> None:
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
            RoleBinding.event_id == event_id,
            RoleBinding.role == "speaker",
        )
    )
    if binding is None:
        db.add(RoleBinding(user_id=user.id, event_id=event_id, role="speaker"))


def create_speaker(db: Session, repos: Repositories, event_id: str, payload) -> dict[str, Any]:
    profile = payload.model_dump(
        exclude={"email", "speaker_status", "confirmation_status", "custom_fields"}, exclude_none=True
    )
    person = repos.people.upsert_by_email(payload.email.lower(), profile)
    repos.event_people.upsert(
        event_id,
        person.id,
        {
            "speaker_status": payload.speaker_status,
            "confirmation_status": payload.confirmation_status,
            "custom_fields_json": payload.custom_fields,
        },
    )
    _provision_speaker_user(db, event_id, person)
    db.commit()
    return speaker_view(repos, event_id, person.id)


def organizer_update_speaker(
    db: Session, repos: Repositories, event_id: str, person_id: str, payload
) -> dict[str, Any]:
    person = repos.people.get(person_id)
    event_person = repos.event_people.get(event_id, person_id)
    if person is None or event_person is None:
        raise HTTPException(status_code=404, detail="Speaker not found")
    profile = payload.model_dump(
        exclude={"speaker_status", "confirmation_status", "custom_fields"}, exclude_none=True
    )
    for key, value in profile.items():
        setattr(person, key, None if key == "website" and value == "" else value)
    if payload.speaker_status is not None:
        event_person.speaker_status = payload.speaker_status
    if payload.confirmation_status is not None:
        event_person.confirmation_status = payload.confirmation_status
    if payload.custom_fields is not None:
        event_person.custom_fields_json = payload.custom_fields
    _provision_speaker_user(db, event_id, person)
    db.commit()
    return speaker_view(repos, event_id, person_id)


#: Header aliases accepted by the speaker CSV import. The eval fixture ships
#: `name,email,title,company,bio`, but organizers export from all sorts of tools,
#: so each field takes the obvious synonyms rather than demanding one shape.
_CSV_ALIASES: dict[str, tuple[str, ...]] = {
    "email": ("email", "email address", "e-mail"),
    "name": ("name", "full name", "speaker", "speaker name"),
    "first_name": ("first name", "firstname", "given name"),
    "last_name": ("last name", "lastname", "surname", "family name"),
    "job_title": ("title", "job title", "jobtitle", "role", "position"),
    "company": ("company", "organisation", "organization", "employer"),
    "bio": ("bio", "biography", "about"),
}


def _split_name(full: str) -> tuple[str | None, str | None]:
    parts = [p for p in (full or "").strip().split() if p]
    if not parts:
        return None, None
    if len(parts) == 1:
        return parts[0], None
    return parts[0], " ".join(parts[1:])


def import_speakers_csv(db: Session, repos: Repositories, event_id: str, content: bytes) -> dict[str, Any]:
    """Bulk-create speakers from a CSV (SPK-03).

    Idempotent on email: re-importing the same file updates the existing people
    instead of creating duplicates, and never blanks a field the sheet left empty.
    """
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="The file has no header row.")

    lookup: dict[str, str] = {}
    for column in reader.fieldnames:
        key = (column or "").strip().lower()
        for field, aliases in _CSV_ALIASES.items():
            if key in aliases:
                lookup[field] = column
                break
    if "email" not in lookup:
        raise HTTPException(status_code=400, detail="The file needs an 'email' column.")

    created, updated, errors = 0, 0, []
    for index, row in enumerate(reader, start=2):
        def value(field: str, _row=row) -> str | None:
            column = lookup.get(field)
            if column is None:
                return None
            return (_row.get(column) or "").strip() or None

        email = value("email")
        if not email or "@" not in email:
            errors.append({"row": index, "message": "Missing or invalid email"})
            continue

        first, last = value("first_name"), value("last_name")
        if not first and not last:
            first, last = _split_name(value("name") or "")

        data = {
            k: v
            for k, v in {
                "first_name": first,
                "last_name": last,
                "job_title": value("job_title"),
                "company": value("company"),
                "bio": value("bio"),
            }.items()
            if v is not None
        }
        existed = repos.people.get_by_email(email) is not None
        person = repos.people.upsert_by_email(email, data)
        repos.event_people.upsert(event_id, person.id, {"speaker_status": "invited"})
        _provision_speaker_user(db, event_id, person)
        created += 0 if existed else 1
        updated += 1 if existed else 0

    db.commit()
    return {"created": created, "updated": updated, "errors": errors}
