from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_repos, require_organization_role
from app.core.db import get_db
from app.models.auth import User
from app.repositories import Repositories
from app.schemas.crm import BulkEmailRequest, ContactNoteCreate, ContactTagsUpdate, PushToEventRequest
from app.services import crm_service

router = APIRouter(prefix="/api/v1/crm", tags=["crm"])


@router.get("/people")
def list_directory(
    search: str | None = Query(default=None),
    company: str | None = Query(default=None),
    job_title: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    _org=Depends(require_organization_role("owner", "admin")),
    repos: Repositories = Depends(get_repos),
) -> list[dict]:
    return crm_service.list_directory(repos, search=search, company=company, job_title=job_title, tag=tag)


@router.get("/dashboard")
def dashboard(
    _org=Depends(require_organization_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> dict:
    return crm_service.dashboard(db, repos)


@router.post("/import", status_code=201)
async def import_csv(
    request: Request,
    _org=Depends(require_organization_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> dict:
    """Bulk-import contacts from a CSV upload (CRM-05)."""
    form = await request.form()
    upload = form.get("file")
    if upload is None or not hasattr(upload, "read"):
        raise HTTPException(status_code=400, detail="Attach a CSV file as 'file'.")
    content = await upload.read()
    return crm_service.import_csv(db, repos, content)


@router.post("/bulk-email")
def bulk_email(
    body: BulkEmailRequest,
    _org=Depends(require_organization_role("owner", "admin")),
    repos: Repositories = Depends(get_repos),
) -> dict:
    return crm_service.bulk_email(repos, body.person_ids, body.subject, body.body_html)


@router.get("/people/{person_id}")
def get_profile(
    person_id: str,
    _org=Depends(require_organization_role("owner", "admin")),
    repos: Repositories = Depends(get_repos),
) -> dict:
    return crm_service.get_profile(repos, person_id)


@router.post("/people/{person_id}/notes", status_code=201)
def add_note(
    person_id: str,
    body: ContactNoteCreate,
    _org=Depends(require_organization_role("owner", "admin")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> dict:
    return crm_service.add_note(db, repos, person_id, user, body.body)


@router.patch("/people/{person_id}/tags")
def set_tags(
    person_id: str,
    body: ContactTagsUpdate,
    _org=Depends(require_organization_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> dict:
    return crm_service.set_tags(db, repos, person_id, body.tags)


@router.post("/people/{person_id}/add-to-event")
def push_to_event(
    person_id: str,
    body: PushToEventRequest,
    _org=Depends(require_organization_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> dict:
    return crm_service.push_to_event(db, repos, person_id, body.event_id)
