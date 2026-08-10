from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.models.auth import EmailJobReceipt
from app.repositories import Repositories
from app.services import communication_service, organization_service, task_service


def run_due_reminders(db: Session, repos: Repositories) -> int:
    """Send due speaker task reminders, idempotently."""
    sent = 0
    organization = organization_service.current(db)
    events = repos.events.list_by_organization(organization.id) if organization else []
    for event in events:
        candidates = task_service.reminder_candidates(repos, event.id, utcnow())
        for assignment in candidates:
            person = repos.people.get(assignment.person_id)
            template = repos.task_templates.get(assignment.template_id) if assignment.template_id else None
            if not person:
                continue
            dedupe = f"reminder:{assignment.id}"
            if db.get(EmailJobReceipt, dedupe):
                continue
            context = {
                "speaker": {
                    "first_name": person.first_name or "",
                    "full_name": " ".join(filter(None, [person.first_name, person.last_name])),
                },
                "event": {"name": event.name},
                "task": {
                    "name": template.name if template else "Task",
                    "due_date": assignment.due_at.strftime("%Y-%m-%d") if assignment.due_at else "",
                    "instructions": template.instructions if template else "",
                },
                "portal_url": "",
            }
            communication_service.send_automated(
                db,
                repos,
                event.id,
                "task_reminder",
                person.id,
                person.primary_email,
                context,
                related_task_assignment_id=assignment.id,
            )
            db.add(
                EmailJobReceipt(
                    id=dedupe,
                    job_type="task_reminder",
                    dedupe_key=dedupe,
                    status="sent",
                    processed_at=utcnow(),
                )
            )
            sent += 1
        db.commit()
    return sent
