from datetime import timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.models.tasks import TaskAssignment, TaskTemplate
from app.repositories import Repositories


def list_templates(repos: Repositories, event_id: str) -> list[TaskTemplate]:
    return repos.task_templates.list_by_event(event_id)


def create_template(db: Session, repos: Repositories, event_id: str, payload) -> TaskTemplate:
    template = repos.task_templates.create(
        event_id,
        {
            "name": payload.name,
            "instructions": payload.instructions,
            "task_type": payload.task_type,
            "required": payload.required,
            "due_rule_json": payload.due_rule or {},
            "applies_when_json": payload.applies_when or {},
            "target_type": payload.target_type,
            "portal_form_id": payload.portal_form_id,
        },
    )
    db.commit()
    return template


def update_template(db: Session, repos: Repositories, template_id: str, patch: dict) -> TaskTemplate:
    template = repos.task_templates.update(template_id, patch)
    if template is None:
        raise HTTPException(status_code=404, detail="Task template not found")
    db.commit()
    return template


def copy_templates(
    db: Session, repos: Repositories, source_event_id: str, target_event_id: str, template_ids: list[str]
) -> list[TaskTemplate]:
    source = repos.task_templates.list_by_event(source_event_id)
    selected = set(template_ids)
    if selected:
        source = [template for template in source if template.id in selected]
    copied = []
    for template in source:
        copied.append(
            repos.task_templates.create(
                target_event_id,
                {
                    "name": template.name,
                    "instructions": template.instructions,
                    "task_type": template.task_type,
                    "required": template.required,
                    "due_rule_json": template.due_rule_json or {},
                    "applies_when_json": template.applies_when_json or {},
                    "target_type": template.target_type,
                    "portal_form_id": None,
                },
            )
        )
    db.commit()
    return copied


def _due_date(template: TaskTemplate) -> Any:
    rule = template.due_rule_json or {}
    if rule.get("due_at"):
        return rule["due_at"]
    offset_days = int(rule.get("offset_days", 0) or 0)
    return utcnow() + timedelta(days=offset_days) if offset_days else None


def generate_assignments(
    db: Session,
    repos: Repositories,
    event_id: str,
    person_id: str,
    *,
    session_id: str | None = None,
    submission_id: str | None = None,
) -> list[TaskAssignment]:
    """Create task assignments from templates (§10.3 step 5, §14.1)."""
    created: list[TaskAssignment] = []
    for template in repos.task_templates.list_by_event(event_id):
        applies = template.applies_when_json or {}
        if applies.get("speaker_status") and applies["speaker_status"] != "accepted":
            continue
        existing = [
            a
            for a in repos.task_assignments.list_for_person(person_id)
            if a.template_id == template.id and a.submission_id == submission_id and a.session_id == session_id
        ]
        if existing:
            continue
        assignment = repos.task_assignments.create(
            {
                "event_id": event_id,
                "template_id": template.id,
                "person_id": person_id,
                "session_id": session_id,
                "submission_id": submission_id,
                "status": "open",
                "due_at": _due_date(template),
            }
        )
        created.append(assignment)
    db.commit()
    return created


def assign_template(
    db: Session,
    repos: Repositories,
    event_id: str,
    template_id: str,
    person_ids: list[str],
    *,
    due_at=None,
    session_id: str | None = None,
) -> list[TaskAssignment]:
    """Assign one explicit task to selected speakers, idempotently."""
    template = repos.task_templates.get(template_id)
    if template is None or template.event_id != event_id:
        raise HTTPException(status_code=404, detail="Task template not found")
    if session_id:
        session = repos.sessions.get(session_id)
        if session is None or session.event_id != event_id:
            raise HTTPException(status_code=404, detail="Session not found")

    created: list[TaskAssignment] = []
    for person_id in dict.fromkeys(person_ids):
        if repos.event_people.get(event_id, person_id) is None:
            raise HTTPException(status_code=404, detail=f"Speaker {person_id} not found")
        existing = next(
            (
                assignment
                for assignment in repos.task_assignments.list_for_person(person_id)
                if assignment.event_id == event_id
                and assignment.template_id == template_id
                and assignment.session_id == session_id
            ),
            None,
        )
        if existing:
            continue
        created.append(
            repos.task_assignments.create(
                {
                    "event_id": event_id,
                    "template_id": template_id,
                    "person_id": person_id,
                    "session_id": session_id,
                    "status": "open",
                    "due_at": due_at or _due_date(template),
                }
            )
        )
    db.commit()
    return created


def complete_assignment(
    db: Session, repos: Repositories, assignment: TaskAssignment, completion_data: dict | None = None
) -> TaskAssignment:
    if assignment.status == "completed":
        raise HTTPException(status_code=409, detail="Task already completed.")
    assignment.status = "completed"
    assignment.completed_at = utcnow()
    if completion_data:
        assignment.completion_data_json = {**(assignment.completion_data_json or {}), **completion_data}
    _refresh_readiness(db, repos, assignment.event_id, assignment.person_id)
    db.commit()
    return assignment


def _refresh_readiness(db: Session, repos: Repositories, event_id: str, person_id: str) -> None:
    total = len([a for a in repos.task_assignments.list_for_person(person_id) if a.event_id == event_id])
    completed = repos.task_assignments.count_completed_by_person(person_id)
    percent = round(completed / total * 100) if total else 0
    repos.event_people.upsert(event_id, person_id, {"onboarding_completion_percent": percent})
    db.flush()


def reminder_candidates(repos: Repositories, event_id: str, now, window_days: int = 2) -> list[TaskAssignment]:
    due_before = now + timedelta(days=window_days)
    return repos.task_assignments.reminder_candidates(event_id, due_before, 24 * window_days)


# swyx's answer to "for speaker onboarding, what are the must-have tasks?":
# 1) hotel stay requirement form, 2) flight reimbursement form, and the optional
# 3) finalize talk description, 4) finalize bio/photos, 5) announce participation,
# 6) invite colleagues with speaker discount.
#
# Two of them are questionnaires, so they ship with a backing portal form; the
# rest are confirmations or profile prompts.
_STARTER_FORMS: dict[str, dict[str, Any]] = {
    "hotel": {
        "name": "Hotel stay requirements",
        "description": "Tell us whether you need a room and for which nights.",
        "sections": [
            {
                "key": "stay",
                "title": "Your stay",
                "fields": [
                    {
                        "key": "needs_room",
                        "label": "Do you need us to book a hotel room?",
                        "field_type": "radio",
                        "options": ["Yes, please book for me", "No, I'll arrange my own"],
                        "required": True,
                    },
                    {"key": "check_in", "label": "Check-in date", "field_type": "date"},
                    {"key": "check_out", "label": "Check-out date", "field_type": "date"},
                    {
                        "key": "accessibility",
                        "label": "Accessibility or dietary needs",
                        "field_type": "long_text",
                        "help_text": "Anything the hotel or catering team should know.",
                    },
                ],
            }
        ],
    },
    "travel": {
        "name": "Flight reimbursement",
        "description": "We reimburse economy travel. Send us the details and we'll process it after the event.",
        "sections": [
            {
                "key": "travel",
                "title": "Travel details",
                "fields": [
                    {"key": "departure_city", "label": "Departing from", "field_type": "short_text", "required": True},
                    {"key": "arrival_date", "label": "Arrival date", "field_type": "date", "required": True},
                    {"key": "departure_date", "label": "Departure date", "field_type": "date", "required": True},
                    {
                        "key": "amount",
                        "label": "Amount to reimburse (USD)",
                        "field_type": "number",
                        "help_text": "Leave blank if you have not booked yet.",
                    },
                ],
            }
        ],
    },
}

_STARTER_TEMPLATES: list[dict[str, Any]] = [
    {
        "name": "Confirm your hotel stay",
        "instructions": "Let us know whether you need a room so we can hold it before the block closes.",
        "task_type": "form",
        "form_key": "hotel",
        "offset_days": 7,
        "required": True,
    },
    {
        "name": "Submit flight reimbursement details",
        "instructions": "Share your travel details so finance can process your reimbursement.",
        "task_type": "form",
        "form_key": "travel",
        "offset_days": 21,
        "required": False,
    },
    {
        "name": "Finalize your talk description",
        "instructions": "Review the abstract we'll publish on the website and make any last edits.",
        "task_type": "confirmation",
        "offset_days": 14,
        "required": True,
    },
    {
        "name": "Finalize your bio and photo",
        "instructions": "Your headshot and bio appear on the program and in the event app.",
        "task_type": "profile",
        "offset_days": 14,
        "required": True,
    },
    {
        "name": "Announce your participation",
        "instructions": "Share the news with your network — we'll send you graphics and suggested copy.",
        "task_type": "confirmation",
        "offset_days": 10,
        "required": False,
    },
    {
        "name": "Invite colleagues with your speaker discount",
        "instructions": "Speakers get a discount code to share with their team.",
        "task_type": "custom",
        "offset_days": 30,
        "required": False,
    },
]


def create_starter_pack(db: Session, repos: Repositories, event_id: str) -> dict[str, Any]:
    """Create the default speaker onboarding tasks for an event.

    Idempotent by name: re-running skips templates the event already has, so an
    organizer who added one by hand does not end up with a duplicate.
    """
    existing = {t.name for t in repos.task_templates.list_by_event(event_id)}
    existing_forms = {f.name: f for f in repos.portal_forms.list_by_event(event_id)}

    form_ids: dict[str, str] = {}
    for key, spec in _STARTER_FORMS.items():
        found = existing_forms.get(spec["name"])
        if found is not None:
            form_ids[key] = found.id
            continue
        form = repos.portal_forms.create(
            event_id,
            {
                "name": spec["name"],
                "description": spec["description"],
                "target_type": "contact",
                "sections_json": spec["sections"],
                "settings_json": {},
                "status": "open",
            },
        )
        form_ids[key] = form.id

    created = 0
    for spec in _STARTER_TEMPLATES:
        if spec["name"] in existing:
            continue
        repos.task_templates.create(
            event_id,
            {
                "name": spec["name"],
                "instructions": spec["instructions"],
                "task_type": spec["task_type"],
                "required": spec["required"],
                "due_rule_json": {"offset_days": spec["offset_days"]},
                "applies_when_json": {},
                "target_type": "contact",
                "portal_form_id": form_ids.get(spec.get("form_key", "")),
            },
        )
        created += 1

    db.commit()
    return {"created": created, "skipped": len(_STARTER_TEMPLATES) - created}
