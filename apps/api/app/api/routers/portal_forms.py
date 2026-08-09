from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import (
    get_repos,
    require_event_role,
    require_field_definition_role,
    require_portal_form_role,
)
from app.core.db import get_db
from app.repositories import Repositories
from app.schemas.portal import (
    FieldDefinitionCreate,
    FieldDefinitionUpdate,
    PortalFormCreate,
    PortalFormUpdate,
)
from app.services import portal_service

router = APIRouter(prefix="/api/v1", tags=["portal forms"])


@router.get("/events/{event_id}/field-definitions")
def list_fields(
    event_id: str = Depends(require_event_role("owner", "admin")),
    repos: Repositories = Depends(get_repos),
):
    return [portal_service.field_view(field) for field in repos.field_definitions.list_by_event(event_id)]


@router.post("/events/{event_id}/field-definitions", status_code=201)
def create_field(
    body: FieldDefinitionCreate,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    return portal_service.create_field(db, repos, event_id, body)


@router.patch("/field-definitions/{field_id}")
def update_field(
    body: FieldDefinitionUpdate,
    field_id: str = Depends(require_field_definition_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    return portal_service.update_field(db, repos, field_id, body)


@router.delete("/field-definitions/{field_id}")
def delete_field(
    field_id: str = Depends(require_field_definition_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    field = repos.field_definitions.get(field_id)
    if field.locked:
        raise HTTPException(status_code=409, detail="Locked fields cannot be deleted.")
    repos.field_definitions.delete(field_id)
    db.commit()
    return {"ok": True}


@router.get("/events/{event_id}/portal-forms")
def list_forms(event_id: str = Depends(require_event_role("owner", "admin")), repos: Repositories = Depends(get_repos)):
    return [portal_service.form_view(form) for form in repos.portal_forms.list_by_event(event_id)]


@router.post("/events/{event_id}/portal-forms", status_code=201)
def create_form(
    body: PortalFormCreate,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    return portal_service.create_form(db, repos, event_id, body)


@router.get("/portal-forms/{form_id}")
def get_form(
    form_id: str = Depends(require_portal_form_role("owner", "admin")),
    repos: Repositories = Depends(get_repos),
):
    return portal_service.form_view(repos.portal_forms.get(form_id))


@router.patch("/portal-forms/{form_id}")
def update_form(
    body: PortalFormUpdate,
    form_id: str = Depends(require_portal_form_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    return portal_service.update_form(db, repos, form_id, body)


@router.post("/portal-forms/{form_id}/duplicate", status_code=201)
def duplicate_form(
    form_id: str = Depends(require_portal_form_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    return portal_service.duplicate_form(db, repos, form_id)


@router.delete("/portal-forms/{form_id}")
def delete_form(
    form_id: str = Depends(require_portal_form_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    repos.portal_forms.delete(form_id)
    db.commit()
    return {"ok": True}
