from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_repos, require_event_role, require_person, require_saved_view_role
from app.core.db import get_db
from app.repositories import Repositories
from app.schemas.ops import SavedViewCreate, SavedViewRead, SavedViewUpdate

router = APIRouter(prefix="/api/v1", tags=["saved views"])


@router.get("/events/{event_id}/saved-views", response_model=list[SavedViewRead])
def list_views(
    event_id: str = Depends(require_event_role("owner", "admin")),
    resource_type: str | None = Query(default=None),
    owner_person_id: str = Depends(require_person),
    repos: Repositories = Depends(get_repos),
) -> list:
    views = repos.saved_views.list_for_owner(event_id, owner_person_id, resource_type)
    return [_view(v) for v in views]


@router.post("/events/{event_id}/saved-views", response_model=SavedViewRead, status_code=201)
def create_view(
    body: SavedViewCreate,
    event_id: str = Depends(require_event_role("owner", "admin")),
    owner_person_id: str = Depends(require_person),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    view = repos.saved_views.create(
        {
            "event_id": event_id,
            "owner_person_id": owner_person_id,
            "resource_type": body.resource_type,
            "name": body.name,
            "filters_json": body.filters,
            "sorts_json": body.sorts,
            "columns_json": body.columns,
        }
    )
    db.commit()
    return _view(view)


@router.patch("/saved-views/{view_id}", response_model=SavedViewRead)
def update_view(
    body: SavedViewUpdate,
    view_id: str = Depends(require_saved_view_role("owner", "admin")),
    owner_person_id: str = Depends(require_person),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    view = repos.saved_views.get(view_id)
    if view is None or view.owner_person_id != owner_person_id:
        raise HTTPException(status_code=404, detail="Saved view not found")
    patch = body.model_dump(exclude_unset=True)
    if body.filters is not None:
        patch["filters_json"] = body.filters
    if body.sorts is not None:
        patch["sorts_json"] = body.sorts
    if body.columns is not None:
        patch["columns_json"] = body.columns
    view = repos.saved_views.update(view_id, patch)
    db.commit()
    return _view(view)


@router.delete("/saved-views/{view_id}")
def delete_view(
    view_id: str = Depends(require_saved_view_role("owner", "admin")),
    owner_person_id: str = Depends(require_person),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    view = repos.saved_views.get(view_id)
    if view is None or view.owner_person_id != owner_person_id:
        raise HTTPException(status_code=404, detail="Saved view not found")
    repos.saved_views.delete(view_id)
    db.commit()
    return {"ok": True}


def _view(v):
    return {
        "id": v.id,
        "event_id": v.event_id,
        "owner_person_id": v.owner_person_id,
        "resource_type": v.resource_type,
        "name": v.name,
        "filters": v.filters_json or {},
        "sorts": v.sorts_json or [],
        "columns": v.columns_json or [],
    }
