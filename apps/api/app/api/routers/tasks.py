from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import (
    _authorize_event,
    get_principal,
    get_repos,
    require_event_role,
    require_task_assignment_role,
    require_task_template_role,
)
from app.core.db import get_db
from app.repositories import Repositories
from app.schemas.ops import (
    BatchTaskAssignmentRequest,
    CompleteTaskRequest,
    GenerateAssignmentsRequest,
    TaskTemplateCopyRequest,
    TaskTemplateCreate,
    TaskTemplateUpdate,
)
from app.services import communication_service, task_service

router = APIRouter(prefix="/api/v1", tags=["tasks"])


def _template_view(template) -> dict:
    return {
        "id": template.id,
        "event_id": template.event_id,
        "name": template.name,
        "instructions": template.instructions,
        "task_type": template.task_type,
        "required": template.required,
        "due_rule": template.due_rule_json or {},
        "applies_when": template.applies_when_json or {},
        "target_type": template.target_type,
        "portal_form_id": template.portal_form_id,
    }


def _assignment_view(repos: Repositories, assignment) -> dict:
    template = repos.task_templates.get(assignment.template_id) if assignment.template_id else None
    person = repos.people.get(assignment.person_id)
    return {
        "id": assignment.id,
        "event_id": assignment.event_id,
        "template_id": assignment.template_id,
        "name": template.name if template else "Task",
        "person_id": assignment.person_id,
        "person_email": person.primary_email if person else None,
        "person_name": " ".join(filter(None, [person.first_name, person.last_name])) if person else None,
        "session_id": assignment.session_id,
        "submission_id": assignment.submission_id,
        "status": assignment.status,
        "due_at": assignment.due_at,
        "completed_at": assignment.completed_at,
    }


@router.get("/events/{event_id}/task-templates")
def list_templates(
    event_id: str = Depends(require_event_role("owner", "admin")),
    target_type: str | None = Query(default=None),
    repos: Repositories = Depends(get_repos),
) -> list[dict]:
    templates = repos.task_templates.list_by_event(event_id)
    if target_type:
        templates = [template for template in templates if template.target_type == target_type]
    return [_template_view(t) for t in templates]


@router.post("/events/{event_id}/task-templates", status_code=201)
def create_template(
    body: TaskTemplateCreate,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    template = task_service.create_template(db, repos, event_id, body)
    return _template_view(template)


@router.post("/events/{event_id}/task-templates/copy-from", status_code=201)
def copy_templates(
    body: TaskTemplateCopyRequest,
    event_id: str = Depends(require_event_role("owner", "admin")),
    principal=Depends(get_principal),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    if not _authorize_event(db, principal, body.source_event_id, {"owner", "admin"}):
        raise HTTPException(status_code=403, detail="You need write access to the source event.")
    copied = task_service.copy_templates(db, repos, body.source_event_id, event_id, body.template_ids)
    return {"templates": [_template_view(template) for template in copied]}


@router.patch("/task-templates/{template_id}")
def update_template(
    body: TaskTemplateUpdate,
    template_id: str = Depends(require_task_template_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    patch = body.model_dump(exclude_unset=True)
    if body.due_rule is not None:
        patch["due_rule_json"] = body.due_rule
    if body.applies_when is not None:
        patch["applies_when_json"] = body.applies_when
    template = task_service.update_template(db, repos, template_id, patch)
    return _template_view(template)


@router.get("/events/{event_id}/task-assignments")
def list_assignments(
    event_id: str = Depends(require_event_role("owner", "admin")),
    status: str | None = Query(default=None),
    overdue: bool = Query(default=False),
    repos: Repositories = Depends(get_repos),
) -> list[dict]:
    filters = {"status": status, "overdue": overdue or None}
    assignments = repos.task_assignments.list_by_event(event_id, {k: v for k, v in filters.items() if v})
    return [_assignment_view(repos, a) for a in assignments]


@router.post("/events/{event_id}/task-templates/starter-pack", status_code=201)
def create_starter_pack(
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    """Seed the default speaker onboarding tasks (and their portal forms)."""
    return task_service.create_starter_pack(db, repos, event_id)


@router.post("/events/{event_id}/task-assignments/generate")
def generate_assignments(
    body: GenerateAssignmentsRequest,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    created = task_service.generate_assignments(
        db,
        repos,
        event_id,
        body.person_id,
        session_id=body.session_id,
        submission_id=body.submission_id,
    )
    return {"created": len(created)}


@router.post("/events/{event_id}/task-assignments/batch", status_code=201)
def batch_assign_task(
    body: BatchTaskAssignmentRequest,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    created = task_service.assign_template(
        db,
        repos,
        event_id,
        body.template_id,
        body.person_ids,
        due_at=body.due_at,
        session_id=body.session_id,
    )
    return {"created": len(created), "assignments": [_assignment_view(repos, assignment) for assignment in created]}


@router.post("/task-assignments/{assignment_id}/complete")
def complete_assignment(
    body: CompleteTaskRequest,
    assignment_id: str = Depends(require_task_assignment_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    assignment = repos.task_assignments.get(assignment_id)
    assignment = task_service.complete_assignment(db, repos, assignment, body.completion_data)
    return _assignment_view(repos, assignment)


@router.post("/task-assignments/remind")
def remind_assignments(
    body: dict,
    principal=Depends(get_principal),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    event_id = body.get("event_id")
    if not event_id:
        raise HTTPException(status_code=400, detail="event_id is required.")
    from app.api.deps import _authorize_event

    if not _authorize_event(db, principal, event_id, {"owner", "admin"}):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    ids = body.get("assignment_ids") or []
    sent = 0
    for assignment_id in ids:
        assignment = repos.task_assignments.get(assignment_id)
        if assignment is None or assignment.status == "completed" or assignment.event_id != event_id:
            continue
        person = repos.people.get(assignment.person_id)
        template = repos.task_templates.get(assignment.template_id) if assignment.template_id else None
        event = repos.events.get(event_id)
        if not person:
            continue
        context = {
            "speaker": {
                "first_name": person.first_name or "",
                "full_name": " ".join(filter(None, [person.first_name, person.last_name])),
            },
            "event": {"name": event.name if event else ""},
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
            event_id,
            "task_reminder",
            person.id,
            person.primary_email,
            context,
            related_task_assignment_id=assignment.id,
        )
        sent += 1
    return {"sent": sent}
