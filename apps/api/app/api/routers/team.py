from fastapi import APIRouter, Depends

from app.api.deps import get_repos, require_event_role
from app.core.db import get_db
from app.repositories import Repositories
from app.schemas.ops import AddMemberRequest
from app.services import team_service

router = APIRouter(prefix="/api/v1", tags=["team"])


@router.get("/events/{event_id}/team")
def list_team(
    event_id: str = Depends(require_event_role("owner", "admin")),
    db=Depends(get_db),
):
    return team_service.list_team(db, event_id)


@router.post("/events/{event_id}/team", status_code=201)
def add_member(
    body: AddMemberRequest,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db=Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    return team_service.add_member(db, repos, event_id, body.email, body.role)


@router.delete("/events/{event_id}/team/{user_id}")
def remove_member(
    user_id: str,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db=Depends(get_db),
):
    team_service.remove_member(db, event_id, user_id)
    return {"ok": True}
