from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_repos, require_event_role
from app.core.db import get_db
from app.repositories import Repositories
from app.schemas.program import (
    RoomCreate,
    RoomRead,
    RoomUpdate,
    SessionFormatCreate,
    SessionFormatRead,
    SessionFormatUpdate,
    TagCreate,
    TagRead,
    TagUpdate,
    TrackCreate,
    TrackRead,
    TrackUpdate,
)
from app.services import program_service

router = APIRouter(
    prefix="/api/v1/events/{event_id}",
    tags=["program"],
    dependencies=[Depends(require_event_role("owner", "admin"))],
)


@router.get("/tracks", response_model=list[TrackRead])
def list_tracks(event_id: str, repos: Repositories = Depends(get_repos)) -> list:
    return program_service.TrackService().list(repos, event_id)


@router.post("/tracks", response_model=TrackRead, status_code=201)
def create_track(
    event_id: str, body: TrackCreate, db: Session = Depends(get_db), repos: Repositories = Depends(get_repos)
) -> TrackRead:
    item = program_service.TrackService().create(repos, event_id, body)
    db.commit()
    return item


@router.patch("/tracks/{track_id}", response_model=TrackRead)
def update_track(
    track_id: str,
    body: TrackUpdate,
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> TrackRead:
    item = program_service.TrackService().update(repos, track_id, body)
    db.commit()
    return item


@router.get("/rooms", response_model=list[RoomRead])
def list_rooms(event_id: str, repos: Repositories = Depends(get_repos)) -> list:
    return program_service.RoomService().list(repos, event_id)


@router.post("/rooms", response_model=RoomRead, status_code=201)
def create_room(
    event_id: str, body: RoomCreate, db: Session = Depends(get_db), repos: Repositories = Depends(get_repos)
) -> RoomRead:
    item = program_service.RoomService().create(repos, event_id, body)
    db.commit()
    return item


@router.patch("/rooms/{room_id}", response_model=RoomRead)
def update_room(
    room_id: str,
    body: RoomUpdate,
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> RoomRead:
    item = program_service.RoomService().update(repos, room_id, body)
    db.commit()
    return item


@router.get("/formats", response_model=list[SessionFormatRead])
def list_formats(event_id: str, repos: Repositories = Depends(get_repos)) -> list:
    return program_service.FormatService().list(repos, event_id)


@router.post("/formats", response_model=SessionFormatRead, status_code=201)
def create_format(
    event_id: str,
    body: SessionFormatCreate,
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> SessionFormatRead:
    item = program_service.FormatService().create(repos, event_id, body)
    db.commit()
    return item


@router.patch("/formats/{format_id}", response_model=SessionFormatRead)
def update_format(
    format_id: str,
    body: SessionFormatUpdate,
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> SessionFormatRead:
    item = program_service.FormatService().update(repos, format_id, body)
    db.commit()
    return item


@router.get("/tags", response_model=list[TagRead])
def list_tags(event_id: str, repos: Repositories = Depends(get_repos)) -> list:
    return program_service.TagService().list(repos, event_id)


@router.post("/tags", response_model=TagRead, status_code=201)
def create_tag(
    event_id: str, body: TagCreate, db: Session = Depends(get_db), repos: Repositories = Depends(get_repos)
) -> TagRead:
    item = program_service.TagService().create(repos, event_id, body)
    db.commit()
    return item


@router.patch("/tags/{tag_id}", response_model=TagRead)
def update_tag(
    tag_id: str,
    body: TagUpdate,
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> TagRead:
    item = program_service.TagService().update(repos, tag_id, body)
    db.commit()
    return item
