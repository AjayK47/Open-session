from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.repositories import Repositories


def field_view(field) -> dict[str, Any]:
    return {
        "id": field.id,
        "event_id": field.event_id,
        "key": field.key,
        "label": field.label,
        "field_type": field.field_type,
        "config": field.config_json or {},
        "locked": field.locked,
    }


def form_view(form) -> dict[str, Any]:
    return {
        "id": form.id,
        "event_id": form.event_id,
        "name": form.name,
        "description": form.description,
        "target_type": form.target_type,
        "sections": form.sections_json or [],
        "settings": form.settings_json or {},
        "status": form.status,
        "created_at": form.created_at,
        "updated_at": form.updated_at,
    }


def create_field(db: Session, repos: Repositories, event_id: str, payload) -> dict:
    if any(field.key == payload.key for field in repos.field_definitions.list_by_event(event_id)):
        raise HTTPException(status_code=409, detail="Field key already exists for this event.")
    field = repos.field_definitions.create(
        event_id,
        {
            "key": payload.key,
            "label": payload.label,
            "field_type": payload.field_type,
            "config_json": payload.config,
            "locked": payload.locked,
        },
    )
    db.commit()
    return field_view(field)


def update_field(db: Session, repos: Repositories, field_id: str, payload) -> dict:
    field = repos.field_definitions.get(field_id)
    if field is None:
        raise HTTPException(status_code=404, detail="Field definition not found")
    patch = payload.model_dump(exclude_unset=True)
    if field.locked and any(key in patch for key in ("field_type", "config")):
        raise HTTPException(status_code=409, detail="Locked fields cannot change type or configuration.")
    if "config" in patch:
        patch["config_json"] = patch.pop("config")
    field = repos.field_definitions.update(field_id, patch)
    db.commit()
    return field_view(field)


def create_form(db: Session, repos: Repositories, event_id: str, payload) -> dict:
    form = repos.portal_forms.create(
        event_id,
        {
            "name": payload.name,
            "description": payload.description,
            "target_type": payload.target_type,
            "sections_json": payload.sections,
            "settings_json": payload.settings,
            "status": "draft",
        },
    )
    db.commit()
    return form_view(form)


def update_form(db: Session, repos: Repositories, form_id: str, payload) -> dict:
    form = repos.portal_forms.get(form_id)
    if form is None:
        raise HTTPException(status_code=404, detail="Portal form not found")
    patch = payload.model_dump(exclude_unset=True)
    if "sections" in patch:
        patch["sections_json"] = patch.pop("sections")
    if "settings" in patch:
        patch["settings_json"] = patch.pop("settings")
    form = repos.portal_forms.update(form_id, patch)
    db.commit()
    return form_view(form)


def duplicate_form(db: Session, repos: Repositories, form_id: str) -> dict:
    source = repos.portal_forms.get(form_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Portal form not found")
    form = repos.portal_forms.create(
        source.event_id,
        {
            "name": f"{source.name} (copy)",
            "description": source.description,
            "target_type": source.target_type,
            "sections_json": source.sections_json or [],
            "settings_json": source.settings_json or {},
            "status": "draft",
        },
    )
    db.commit()
    return form_view(form)


def validate_form_answers(form, answers: dict[str, Any]) -> list[str]:
    errors = []
    fields = [field for section in (form.sections_json or []) for field in section.get("fields", [])]
    for field in fields:
        if not field.get("required"):
            continue
        value = answers.get(field.get("key"))
        if value is None or value == "" or value == []:
            errors.append(f"{field.get('label', field.get('key'))} is required.")
    return errors


def submit_task_form(db: Session, repos: Repositories, assignment, answers: dict[str, Any]) -> dict:
    template = repos.task_templates.get(assignment.template_id)
    if template is None or template.task_type != "form" or not template.portal_form_id:
        raise HTTPException(status_code=400, detail="This task is not backed by a portal form.")
    form = repos.portal_forms.get(template.portal_form_id)
    if form is None:
        raise HTTPException(status_code=404, detail="Portal form not found")
    errors = validate_form_answers(form, answers)
    if errors:
        raise HTTPException(status_code=400, detail=errors)
    assignment.completion_data_json = {
        **(assignment.completion_data_json or {}),
        "answers": answers,
        "submitted_at": datetime.now(UTC).isoformat(),
    }
    assignment.status = "completed"
    assignment.completed_at = datetime.now(UTC)
    db.commit()
    return {"assignment_id": assignment.id, "status": assignment.status, "answers": answers}
