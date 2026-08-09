from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_repos, require_event_access, require_event_role, require_portal_resource_role
from app.core.db import get_db
from app.repositories import Repositories
from app.schemas.portal import PortalResourceCreate, PortalResourceUpdate

router = APIRouter(prefix="/api/v1", tags=["resources"])


def _view(resource) -> dict:
    return {
        "id": resource.id,
        "event_id": resource.event_id,
        "title": resource.title,
        "body_html": resource.body_html,
        "status": resource.status,
        "sort_order": resource.sort_order,
        "created_at": resource.created_at,
        "updated_at": resource.updated_at,
    }


@router.get("/events/{event_id}/resources")
def list_resources(
    event_id: str = Depends(require_event_role("owner", "admin")),
    repos: Repositories = Depends(get_repos),
):
    """Organizer view: every resource page, draft and published (§8 wiki pages)."""
    return [_view(r) for r in repos.portal_resources.list_by_event(event_id)]


@router.post("/events/{event_id}/resources", status_code=201)
def create_resource(
    body: PortalResourceCreate,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    resource = repos.portal_resources.create(event_id, body.model_dump())
    db.commit()
    return _view(resource)


@router.patch("/resources/{resource_id}")
def update_resource(
    body: PortalResourceUpdate,
    resource_id: str = Depends(require_portal_resource_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    updated = repos.portal_resources.update(resource_id, body.model_dump(exclude_unset=True))
    if updated is None:
        raise HTTPException(status_code=404, detail="Resource not found")
    db.commit()
    return _view(updated)


@router.delete("/resources/{resource_id}", status_code=204)
def delete_resource(
    resource_id: str = Depends(require_portal_resource_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    repos.portal_resources.delete(resource_id)
    db.commit()


@router.get("/events/{event_id}/resources/published")
def list_published_resources(
    event_id: str = Depends(require_event_access),
    repos: Repositories = Depends(get_repos),
):
    """Portal view: anyone with a role on this event (speaker, reviewer, admin)
    can read the published resource pages — organizer reference material, not
    per-person data, so no extra ownership check beyond event membership."""
    return [_view(r) for r in repos.portal_resources.list_by_event(event_id, published_only=True)]
