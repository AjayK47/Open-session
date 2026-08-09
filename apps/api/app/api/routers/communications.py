from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_repos, require_event_role
from app.core.db import get_db
from app.repositories import Repositories
from app.schemas.ops import (
    AutomationCreate,
    AutomationUpdate,
    EmailTemplateCreate,
    EmailTemplateUpdate,
    ManualSendPreview,
    ManualSendRequest,
)
from app.services import communication_service

router = APIRouter(prefix="/api/v1", tags=["communications"])


@router.get("/events/{event_id}/email-templates")
def list_templates(
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> list[dict]:
    communication_service.ensure_default_templates(db, repos, event_id)
    return [_t(t) for t in repos.email_templates.list_by_event(event_id)]


@router.post("/events/{event_id}/email-templates", status_code=201)
def create_template(
    body: EmailTemplateCreate,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    template = repos.email_templates.create(event_id, body.model_dump())
    db.commit()
    return _t(template)


@router.get("/email-templates/{template_id}")
def get_template(
    template_id: str,
    event_id: str = Depends(require_event_role("owner", "admin")),
    repos: Repositories = Depends(get_repos),
):
    template = communication_service.get_template(repos, event_id, template_id)
    return _t(template)


@router.patch("/email-templates/{template_id}")
def update_template(
    body: EmailTemplateUpdate,
    template_id: str,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    communication_service.get_template(repos, event_id, template_id)
    template = repos.email_templates.update(template_id, body.model_dump(exclude_unset=True, exclude_none=True))
    db.commit()
    return _t(template)


@router.get("/events/{event_id}/automations")
def list_automations(
    event_id: str = Depends(require_event_role("owner", "admin")),
    repos: Repositories = Depends(get_repos),
) -> list[dict]:
    return [_a(a) for a in repos.automations.list_by_event(event_id)]


@router.post("/events/{event_id}/automations", status_code=201)
def create_automation(
    body: AutomationCreate,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    automation = repos.automations.create(
        event_id,
        {
            "trigger_type": body.trigger_type,
            "conditions_json": body.conditions,
            "template_id": body.template_id,
            "include_calendar_invite": body.include_calendar_invite,
            "enabled": body.enabled,
        },
    )
    db.commit()
    return _a(automation)


@router.patch("/automations/{automation_id}")
def update_automation(
    body: AutomationUpdate,
    automation_id: str,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    automation = repos.automations.get(automation_id)
    if automation is None or automation.event_id != event_id:
        raise HTTPException(status_code=404, detail="Automation not found")
    patch = body.model_dump(exclude_unset=True)
    if body.conditions is not None:
        patch["conditions_json"] = body.conditions
    automation = repos.automations.update(automation_id, patch)
    db.commit()
    return _a(automation)


@router.get("/events/{event_id}/communications")
def list_communications(
    event_id: str = Depends(require_event_role("owner", "admin")),
    status: str | None = Query(default=None),
    repos: Repositories = Depends(get_repos),
) -> list[dict]:
    filters = {"status": status}
    communications = repos.communications.list_by_event(event_id, {k: v for k, v in filters.items() if v})
    return [_c(c) for c in communications]


@router.post("/events/{event_id}/communications/send")
def send_manual(
    body: ManualSendRequest,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    subject, html = _manual_source(body, event_id, repos)
    if not subject or not html:
        raise HTTPException(status_code=400, detail="Template or subject/html is required.")
    sent = communication_service.manual_send(
        db,
        repos,
        event_id,
        body.template_id,
        subject,
        html,
        body.recipients,
        body.related_submission_id,
        body.related_session_id,
    )
    return {"sent": len(sent)}


@router.post("/events/{event_id}/communications/preview", response_model=ManualSendPreview)
def preview_manual(
    body: ManualSendRequest,
    event_id: str = Depends(require_event_role("owner", "admin")),
    repos: Repositories = Depends(get_repos),
):
    subject, html = _manual_source(body, event_id, repos)
    if not subject or not html:
        raise HTTPException(status_code=400, detail="Template or subject/html is required.")
    email = str(body.recipients[0])
    context, person = communication_service.manual_recipient_context(repos, event_id, email)
    return ManualSendPreview(
        recipient_email=email,
        recipient_name=(" ".join(filter(None, [person.first_name, person.last_name])) if person else email),
        subject=communication_service.render(subject, context),
        html=communication_service.render(html, context),
    )


def _manual_source(body: ManualSendRequest, event_id: str, repos: Repositories) -> tuple[str, str]:
    if body.template_id:
        template = communication_service.get_template(repos, event_id, body.template_id)
        return template.subject_template, template.html_template
    return body.subject or "", body.html or ""


def _t(template) -> dict:
    return {
        "id": template.id,
        "event_id": template.event_id,
        "name": template.name,
        "type": template.type,
        "subject_template": template.subject_template,
        "html_template": template.html_template,
        "text_template": template.text_template,
    }


def _a(automation) -> dict:
    return {
        "id": automation.id,
        "event_id": automation.event_id,
        "trigger_type": automation.trigger_type,
        "conditions": automation.conditions_json or {},
        "template_id": automation.template_id,
        "include_calendar_invite": automation.include_calendar_invite,
        "enabled": automation.enabled,
    }


def _c(c) -> dict:
    return {
        "id": c.id,
        "event_id": c.event_id,
        "recipient_person_id": c.recipient_person_id,
        "recipient_email": c.recipient_email,
        "template_id": c.template_id,
        "related_submission_id": c.related_submission_id,
        "related_session_id": c.related_session_id,
        "related_task_assignment_id": c.related_task_assignment_id,
        "status": c.status,
        "provider_message_id": c.provider_message_id,
        "error_message": c.error_message,
        "sent_at": c.sent_at,
        "created_at": c.created_at,
    }
