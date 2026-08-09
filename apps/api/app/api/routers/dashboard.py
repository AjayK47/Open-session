from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_repos, require_event_role
from app.core.db import get_db
from app.repositories import Repositories
from app.services import metrics_service

router = APIRouter(prefix="/api/v1", tags=["dashboard"])


@router.get("/events/{event_id}/metrics")
def event_metrics(
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> dict:
    return metrics_service.event_metrics(db, repos, event_id)


@router.get("/events/{event_id}/onboarding")
def onboarding_dashboard(
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> dict:
    return metrics_service.onboarding_dashboard(db, repos, event_id)
