from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_repos, require_event_role, require_person
from app.core.config import settings
from app.core.db import get_db
from app.email.templates import portal_invitation_email
from app.models.auth import RoleBinding, User
from app.repositories import Repositories
from app.schemas.ops import ProfileUpdate, SpeakerCreate, SpeakerOrganizerUpdate
from app.services import communication_service, speaker_service

router = APIRouter(prefix="/api/v1", tags=["speakers"])


@router.post("/events/{event_id}/speakers", status_code=201)
def create_speaker(
    body: SpeakerCreate,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    return speaker_service.create_speaker(db, repos, event_id, body)


@router.post("/events/{event_id}/speakers/import", status_code=201)
async def import_speakers(
    request: Request,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    """Bulk-import speakers from a CSV upload (SPK-03)."""
    form = await request.form()
    upload = form.get("file")
    if upload is None or not hasattr(upload, "read"):
        raise HTTPException(status_code=400, detail="Attach a CSV file as 'file'.")
    content = await upload.read()
    return speaker_service.import_speakers_csv(db, repos, event_id, content)


@router.get("/events/{event_id}/speakers")
def list_speakers(
    event_id: str = Depends(require_event_role("owner", "admin")),
    speaker_status: str | None = Query(default=None),
    confirmation_status: str | None = Query(default=None),
    repos: Repositories = Depends(get_repos),
) -> list[dict]:
    return speaker_service.list_speakers(repos, event_id, speaker_status, confirmation_status)


@router.get("/events/{event_id}/speakers/{person_id}")
def get_speaker(
    person_id: str,
    event_id: str = Depends(require_event_role("owner", "admin")),
    repos: Repositories = Depends(get_repos),
) -> dict:
    return speaker_service.speaker_view(repos, event_id, person_id)


@router.patch("/events/{event_id}/speakers/{person_id}")
def organizer_update_speaker(
    body: SpeakerOrganizerUpdate,
    person_id: str,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    return speaker_service.organizer_update_speaker(db, repos, event_id, person_id, body)


@router.post("/events/{event_id}/speakers/{person_id}/invite")
def invite_speaker(
    person_id: str,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    speaker = speaker_service.speaker_view(repos, event_id, person_id)
    event = repos.events.get(event_id)
    portal_url = f"{settings.web_app_url.rstrip('/')}/portal/{event.slug}"
    rendered = portal_invitation_email(
        event_name=event.name,
        recipient_name=speaker["first_name"] or "there",
        portal_url=portal_url,
    )
    sent = communication_service.send(
        db,
        repos,
        event_id,
        recipient_email=speaker["email"],
        recipient_person_id=person_id,
        subject=rendered.subject,
        html=(
            f"<p>Hi {speaker['first_name'] or 'there'},</p>"
            f"<p>Your speaker portal is ready: {event.name}.</p>"
            f"<p><a href='{portal_url}'>Open your speaker portal</a></p>"
        ),
        text=rendered.text,
    )
    return {"sent": 1, "communication_id": sent.id}


@router.patch("/speakers/{person_id}")
def update_speaker_profile(
    body: ProfileUpdate,
    person_id: str,
    person_id_self: str = Depends(require_person),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    if person_id != person_id_self:
        bindings = db.scalars(
            select(RoleBinding).where(RoleBinding.user_id == user.id, RoleBinding.role.in_(("owner", "admin")))
        ).all()
        authorized = any(repos.event_people.get(b.event_id, person_id) is not None for b in bindings)
        if not authorized:
            raise HTTPException(status_code=403, detail="You can only edit your own profile.")
    person = speaker_service.update_profile(db, repos, person_id, body)
    return {
        "person_id": person.id,
        "email": person.primary_email,
        "first_name": person.first_name,
        "last_name": person.last_name,
        "company": person.company,
        "job_title": person.job_title,
    }
