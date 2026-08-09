"""Read models for the public widgets (sessions list, speakers, agenda, gallery).

Everything here is unauthenticated, so it is deliberately a *projection*: only
fields an attendee should see, assembled once and reused by every widget so the
same session cannot describe itself differently on two surfaces (EMB-16).

Two gates decide what appears:
  * `approval_status == "approved"` — the organizer's content review (CNT-12).
  * the session is scheduled (has a start time) or explicitly published.
Anything else is invisible to the public, including drafts and cancellations.
"""

from typing import Any

from app.models.program import Event
from app.repositories import Repositories

PUBLIC_SESSION_STATUSES = ("confirmed", "scheduled", "published")


def _is_public(session: Any) -> bool:
    return session.approval_status == "approved" and session.status in PUBLIC_SESSION_STATUSES


def _speaker_view(person) -> dict[str, Any]:
    return {
        "id": person.id,
        "name": " ".join(filter(None, [person.first_name, person.last_name])) or person.primary_email,
        "first_name": person.first_name,
        "last_name": person.last_name,
        "job_title": person.job_title,
        "company": person.company,
        "bio": person.bio,
        "headshot_file_id": person.headshot_file_id,
        "website": person.website,
        "linkedin_url": person.linkedin_url,
        "x_url": person.x_url,
    }


def _sort_key(speaker: dict[str, Any]) -> tuple[str, str]:
    """Surname first — every directory rubric asks for alphabetical by surname.

    Someone with no surname on file sorts to the *end* rather than jumping to the
    top of the directory on an empty string.
    """
    last = (speaker["last_name"] or "").strip().lower()
    first = (speaker["first_name"] or "").strip().lower()
    return (last or "￿" + first, first)


def public_sessions(repos: Repositories, event: Event) -> list[dict[str, Any]]:
    tracks = {t.id: t for t in repos.tracks.list_by_event(event.id)}
    formats = {f.id: f for f in repos.formats.list_by_event(event.id)}
    rooms = {r.id: r for r in repos.rooms.list_by_event(event.id)}

    rows: list[dict[str, Any]] = []
    for session in repos.sessions.list_by_event(event.id):
        if not _is_public(session):
            continue
        speakers = []
        for participant in repos.session_participants.list_for_session(session.id):
            person = repos.people.get(participant.person_id)
            if person is None:
                continue
            speakers.append({**_speaker_view(person), "role": participant.role})
        track = tracks.get(session.track_id) if session.track_id else None
        fmt = formats.get(session.format_id) if session.format_id else None
        room = rooms.get(session.room_id) if session.room_id else None
        rows.append(
            {
                "id": session.id,
                "title": session.title,
                "description": session.description,
                "starts_at": session.starts_at,
                "ends_at": session.ends_at,
                "room": {"id": room.id, "name": room.name} if room else None,
                "location": session.location,
                "track": {"id": track.id, "name": track.name, "color": track.color} if track else None,
                "format": {"id": fmt.id, "name": fmt.name} if fmt else None,
                "language": session.language,
                "speakers": speakers,
            }
        )

    # Scheduled sessions in time order, unscheduled ones after, alphabetically —
    # so the list is stable whether or not the agenda has been built yet.
    rows.sort(key=lambda r: (r["starts_at"] is None, r["starts_at"] or "", r["title"].lower()))
    return rows


def public_speakers(repos: Repositories, event: Event) -> list[dict[str, Any]]:
    """Everyone appearing on a publicly visible session, alphabetised by surname."""
    by_person: dict[str, dict[str, Any]] = {}
    for session in public_sessions(repos, event):
        for speaker in session["speakers"]:
            entry = by_person.setdefault(speaker["id"], {**speaker, "sessions": []})
            entry["sessions"].append(
                {
                    "id": session["id"],
                    "title": session["title"],
                    "starts_at": session["starts_at"],
                    "ends_at": session["ends_at"],
                    "room": session["room"],
                    "track": session["track"],
                }
            )

    people = []
    for entry in by_person.values():
        entry.pop("role", None)
        people.append(entry)
    people.sort(key=_sort_key)
    return people


def public_program(repos: Repositories, event: Event) -> dict[str, Any]:
    """Everything the widgets need in one payload, so surfaces cannot disagree."""
    sessions = public_sessions(repos, event)
    speakers = public_speakers(repos, event)
    tracks = [
        {"id": t.id, "name": t.name, "color": t.color} for t in repos.tracks.list_by_event(event.id) if t.active
    ]
    return {
        "event": {
            "id": event.id,
            "name": event.name,
            "slug": event.slug,
            "description": event.description,
            "location": event.location,
            "timezone": event.timezone,
            "starts_at": event.starts_at,
            "ends_at": event.ends_at,
            "agenda_published_at": event.agenda_published_at,
        },
        "sessions": sessions,
        "speakers": speakers,
        "tracks": tracks,
        "formats": [{"id": f.id, "name": f.name} for f in repos.formats.list_by_event(event.id)],
        "rooms": [{"id": r.id, "name": r.name} for r in repos.rooms.list_by_event(event.id)],
    }
