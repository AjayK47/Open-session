from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_repos, require_event_role, require_form_role
from app.core.db import get_db
from app.repositories import Repositories
from app.schemas.forms import FormCreate, FormRead, FormUpdate
from app.services import form_service

router = APIRouter(prefix="/api/v1", tags=["forms"])


@router.get("/events/{event_id}/forms", response_model=list[FormRead])
def list_forms(
    event_id: str = Depends(require_event_role("owner", "admin")),
    repos: Repositories = Depends(get_repos),
) -> list[FormRead]:
    return [form_service.form_to_read(f) for f in form_service.list_forms(repos, event_id)]


@router.post("/events/{event_id}/forms", response_model=FormRead, status_code=201)
def create_form(
    body: FormCreate,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> FormRead:
    form = form_service.create_form(db, repos, event_id, body)
    return form_service.form_to_read(form)


@router.get("/forms/{form_id}", response_model=FormRead)
def get_form(
    form_id: str = Depends(require_form_role("owner", "admin")),
    repos: Repositories = Depends(get_repos),
) -> FormRead:
    return form_service.form_to_read(form_service.get_form(repos, form_id))


@router.patch("/forms/{form_id}", response_model=FormRead)
def update_form(
    body: FormUpdate,
    form_id: str = Depends(require_form_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> FormRead:
    return form_service.form_to_read(form_service.update_form(db, repos, form_id, body))


@router.post("/forms/{form_id}/publish", response_model=FormRead)
def publish_form(
    form_id: str = Depends(require_form_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> FormRead:
    return form_service.form_to_read(form_service.set_status(db, repos, form_id, "open"))


@router.post("/forms/{form_id}/close", response_model=FormRead)
def close_form(
    form_id: str = Depends(require_form_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> FormRead:
    return form_service.form_to_read(form_service.set_status(db, repos, form_id, "closed"))


@router.post("/forms/{form_id}/duplicate", response_model=FormRead, status_code=201)
def duplicate_form(
    form_id: str = Depends(require_form_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> FormRead:
    return form_service.form_to_read(form_service.duplicate_form(db, repos, form_id))
