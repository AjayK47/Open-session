from typing import Any

from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.repositories import Repositories


def event_metrics(db: Session, repos: Repositories, event_id: str) -> dict[str, Any]:
    submissions = repos.submissions.list_by_event(event_id)
    tasks = repos.task_assignments.list_by_event(event_id)
    accepted_speakers = len(repos.event_people.list_speakers(event_id))
    sessions = repos.sessions.list_by_event(event_id)

    def count(statuses: set[str]) -> int:
        return sum(1 for s in submissions if s.status in statuses)

    pending_review = count({"submitted", "pending_review"})
    accepted = count({"accepted"})
    return {
        "total_submissions": len(submissions),
        "pending_review": pending_review,
        "accepted_submissions": accepted,
        "accepted_speakers": accepted_speakers,
        "scheduled_sessions": sum(1 for s in sessions if s.starts_at is not None),
        "unscheduled_sessions": sum(1 for s in sessions if s.starts_at is None),
        "outstanding_tasks": sum(1 for t in tasks if t.status == "open"),
        "overdue_tasks": sum(1 for t in tasks if t.status == "open" and t.due_at and t.due_at < utcnow()),
    }


def onboarding_dashboard(db: Session, repos: Repositories, event_id: str) -> dict[str, Any]:
    from app.services import speaker_service

    speakers = speaker_service.list_speakers(repos, event_id)
    ready = sum(1 for s in speakers if s["outstanding_tasks"] == 0)
    breakdown: dict[str, int] = {}
    for speaker in speakers:
        for task in speaker["tasks"]:
            name = task["name"] or "unknown"
            breakdown[name] = breakdown.get(name, 0) + (1 if task["status"] != "completed" else 0)

    return {
        "total_accepted_speakers": len(speakers),
        "fully_ready": ready,
        "outstanding": len(speakers) - ready,
        "average_completion_percent": (
            round(sum(s["onboarding_completion_percent"] for s in speakers) / len(speakers)) if speakers else 0
        ),
        "outstanding_by_task": breakdown,
        "speakers": [
            {
                "person_id": s["person_id"],
                "email": s["email"],
                "first_name": s["first_name"],
                "last_name": s["last_name"],
                "profile_completion_percent": s["profile_completion_percent"],
                "onboarding_completion_percent": s["onboarding_completion_percent"],
                "outstanding_tasks": s["outstanding_tasks"],
                "missing_headshot": not any(f["file_type"] == "headshot" for f in s["files"]),
                "missing_slides": not any(f["file_type"] == "slides" for f in s["files"]),
            }
            for s in speakers
        ],
    }
