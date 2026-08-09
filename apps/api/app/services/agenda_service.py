from typing import Any

from app.models.program import Event
from app.repositories import Repositories
from app.rules.engine import detect_conflicts


def agenda(repos: Repositories, event_id: str) -> list[dict[str, Any]]:
    """Scheduled sessions with participants, for agenda views."""
    rows: list[dict[str, Any]] = []
    for session in repos.sessions.list_scheduled(event_id):
        participants = []
        for participant in repos.session_participants.list_for_session(session.id):
            person = repos.people.get(participant.person_id)
            participants.append(
                {
                    "person_id": participant.person_id,
                    "role": participant.role,
                    "email": person.primary_email if person else "",
                    "first_name": person.first_name if person else None,
                    "last_name": person.last_name if person else None,
                }
            )
        room = repos.rooms.get(session.room_id) if session.room_id else None
        track = repos.tracks.get(session.track_id) if session.track_id else None
        rows.append(
            {
                "id": session.id,
                "title": session.title,
                "status": session.status,
                "track_id": session.track_id,
                "track_name": track.name if track else None,
                "format_id": session.format_id,
                "room_id": session.room_id,
                "room_name": room.name if room else None,
                "starts_at": session.starts_at,
                "ends_at": session.ends_at,
                "duration_minutes": session.duration_minutes,
                "participants": participants,
            }
        )
    return rows


def conflicts(repos: Repositories, event: Event) -> list[dict[str, Any]]:
    sessions = []
    for session in repos.sessions.list_scheduled(event.id):
        track = repos.tracks.get(session.track_id) if session.track_id else None
        participants = repos.session_participants.list_for_session(session.id)
        sessions.append(
            {
                "id": session.id,
                "room_id": session.room_id,
                "track_id": session.track_id,
                "starts_at": session.starts_at,
                "ends_at": session.ends_at,
                "participant_person_ids": [p.person_id for p in participants],
                "track_serial": track.serial_schedule if track else False,
            }
        )
    return detect_conflicts(sessions, event_start=event.starts_at, event_end=event.ends_at)
