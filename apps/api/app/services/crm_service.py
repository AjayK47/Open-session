"""Speaker CRM: an organization-level, cross-event speaker directory.

Deliberately thin. Person is already an organization-scoped entity (unique by
(organization_id, email), no event_id column — see app/models/program.py) and
EventPerson already tracks per-event participation, so the CRM mostly
composes existing repositories rather than introducing a parallel data model.
What's new here is: tags on Person (CRM-04), cross-event notes (CRM-03), and
the org-level views/actions (directory, import, push-to-event, dashboard,
bulk email) that read/write that org's Person data without ever requiring an
event in scope.
"""

import csv
import io
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.email import EmailMessageInput, send_email
from app.email.templates import branded_email
from app.models.auth import User
from app.models.organization import Organization
from app.models.program import Person
from app.repositories import Repositories
from app.services.communication_service import render
from app.services.speaker_service import _provision_speaker_user

_CSV_ALIASES = {
    "email": {"email", "e-mail", "email address"},
    "first_name": {"first_name", "first name", "firstname"},
    "last_name": {"last_name", "last name", "lastname"},
    "name": {"name", "full name"},
    "job_title": {"job_title", "job title", "title", "role"},
    "company": {"company", "organization", "org"},
    "bio": {"bio", "biography"},
}


def _split_name(full: str) -> tuple[str | None, str | None]:
    parts = full.strip().split(None, 1)
    if not parts:
        return None, None
    if len(parts) == 1:
        return parts[0], None
    return parts[0], parts[1]


def _person_summary(repos: Repositories, person: Person) -> dict[str, Any]:
    events = repos.event_people.list_for_person(person.id)
    return {
        "id": person.id,
        "primary_email": person.primary_email,
        "first_name": person.first_name,
        "last_name": person.last_name,
        "company": person.company,
        "job_title": person.job_title,
        "headshot_file_id": person.headshot_file_id,
        "tags": person.tags_json or [],
        "event_count": len(events),
    }


def list_directory(
    repos: Repositories,
    organization_id: str,
    search: str | None = None,
    company: str | None = None,
    job_title: str | None = None,
    tag: str | None = None,
) -> list[dict[str, Any]]:
    people = repos.people.list_all(organization_id, search=search, company=company, job_title=job_title, tag=tag)
    return [_person_summary(repos, p) for p in people]


def _get_own_person(repos: Repositories, organization_id: str, person_id: str) -> Person:
    """A directory contact, scoped to the caller's org — never lets one org
    read/act on another org's Person by guessing/reusing an id."""
    person = repos.people.get(person_id)
    if person is None or person.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Contact not found")
    return person


def get_profile(repos: Repositories, organization_id: str, person_id: str) -> dict[str, Any]:
    person = _get_own_person(repos, organization_id, person_id)
    events = repos.event_people.list_for_person(person_id)
    event_rows = []
    for ep in events:
        event = repos.events.get(ep.event_id)
        if event is None:
            continue
        event_rows.append(
            {
                "event_id": event.id,
                "event_name": event.name,
                "speaker_status": ep.speaker_status,
                "confirmation_status": ep.confirmation_status,
            }
        )
    notes = repos.person_notes.list_for_person(person_id)
    return {
        **_person_summary(repos, person),
        "bio": person.bio,
        "phone": person.phone,
        "website": person.website,
        "linkedin_url": person.linkedin_url,
        "x_url": person.x_url,
        "events": event_rows,
        "notes": [
            {"id": n.id, "author_name": n.author_name, "body": n.body, "created_at": n.created_at}
            for n in notes
        ],
    }


def add_note(
    db: Session, repos: Repositories, organization_id: str, person_id: str, author: User, body: str
) -> dict[str, Any]:
    _get_own_person(repos, organization_id, person_id)
    author_name = author.email
    if author.person_id:
        author_person = repos.people.get(author.person_id)
        if author_person is not None:
            full = " ".join(filter(None, [author_person.first_name, author_person.last_name]))
            author_name = full or author.email
    note = repos.person_notes.create(
        {"person_id": person_id, "author_user_id": author.id, "author_name": author_name, "body": body}
    )
    db.commit()
    return {"id": note.id, "author_name": note.author_name, "body": note.body, "created_at": note.created_at}


def set_tags(
    db: Session, repos: Repositories, organization_id: str, person_id: str, tags: list[str]
) -> dict[str, Any]:
    person = _get_own_person(repos, organization_id, person_id)
    cleaned = sorted({t.strip() for t in tags if t.strip()})
    person.tags_json = cleaned
    db.commit()
    return _person_summary(repos, person)


def import_csv(db: Session, repos: Repositories, organization_id: str, content: bytes) -> dict[str, Any]:
    """Bulk-create/update contacts from a CSV, org-level (CRM-05).

    Idempotent on email, same as the per-event speaker import — re-importing
    updates existing contacts instead of duplicating them.
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
        existed = repos.people.get_by_email(organization_id, email.lower()) is not None
        repos.people.upsert_by_email(organization_id, email.lower(), data)
        created += 0 if existed else 1
        updated += 1 if existed else 0

    db.commit()
    return {"created": created, "updated": updated, "errors": errors}


def push_to_event(
    db: Session, repos: Repositories, organization_id: str, person_id: str, event_id: str
) -> dict[str, Any]:
    """Reuse a directory contact on a specific event's speaker roster (CRM-10)."""
    person = _get_own_person(repos, organization_id, person_id)
    event = repos.events.get(event_id)
    if event is None or event.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Event not found")
    repos.event_people.upsert(event_id, person_id, {"speaker_status": "invited"})
    _provision_speaker_user(db, event_id, person)
    db.commit()
    return {"event_id": event_id, "event_name": event.name, **_person_summary(repos, person)}


def dashboard(db: Session, repos: Repositories, organization: Organization) -> dict[str, Any]:
    people = repos.people.list_all(organization.id)
    events = repos.events.list_by_organization(organization.id)
    returning = 0
    companies: dict[str, int] = {}
    for person in people:
        event_count = len(repos.event_people.list_for_person(person.id))
        if event_count > 1:
            returning += 1
        if person.company:
            companies[person.company] = companies.get(person.company, 0) + 1
    top_companies = sorted(companies.items(), key=lambda kv: kv[1], reverse=True)[:5]
    return {
        "total_contacts": len(people),
        "total_events": len(events),
        "returning_speakers": returning,
        "top_companies": [{"name": name, "count": count} for name, count in top_companies],
    }


def bulk_email(
    repos: Repositories, organization_id: str, person_ids: list[str], subject: str, body_html: str
) -> dict[str, Any]:
    """Send a templated email to selected directory contacts (CRM-11).

    Sends directly through the same provider-agnostic send_email() the rest
    of the app uses, rather than the per-event Communication log — a CRM
    outreach send has no event to attach that log row to. Merge tags resolve
    through the same render() helper as event-scoped sends.
    """
    sent, failed = 0, []
    for person_id in person_ids:
        person = repos.people.get(person_id)
        if person is None or person.organization_id != organization_id or not person.primary_email:
            failed.append(person_id)
            continue
        context = {
            "contact": {
                "first_name": person.first_name or "",
                "last_name": person.last_name or "",
                "name": " ".join(filter(None, [person.first_name, person.last_name])) or person.primary_email,
                "company": person.company or "",
                "email": person.primary_email,
            }
        }
        rendered_subject = render(subject, context)
        rendered_html = render(body_html, context)
        branded = branded_email(
            subject=rendered_subject,
            preheader=rendered_subject,
            eyebrow="Speaker outreach",
            title=rendered_subject,
            body_html=rendered_html,
            body_text=rendered_html,
            footer="Sent by your event team",
        )
        send_email(EmailMessageInput(to=person.primary_email, subject=branded.subject, html=branded.html, text=branded.text))
        sent += 1
    return {"sent": sent, "failed": failed, "sent_at": utcnow()}
