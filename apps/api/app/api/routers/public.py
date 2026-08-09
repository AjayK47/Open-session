from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_repos
from app.core.config import settings
from app.core.db import get_db
from app.core.rate_limit import check_rate_limit, ip_rate_limit
from app.models.auth import User
from app.repositories import Repositories
from app.schemas.auth import AuthUserRead, RequestCodeRequest, RequestCodeResponse, VerifyRequest
from app.schemas.events import PublicEventSummary
from app.schemas.forms import PublicFormRead
from app.schemas.submissions import SubmissionRead, SubmissionWrite, SubmitResponse
from app.services import auth_service, file_service, form_service, public_program_service, submission_service

router = APIRouter(prefix="/api/v1/public", tags=["public"])

_request_code_ip_limit = ip_rate_limit(
    "auth_request_code", settings.auth_request_code_limit, settings.auth_request_code_window_seconds
)
_verify_ip_limit = ip_rate_limit("auth_verify", settings.auth_verify_limit, settings.auth_verify_window_seconds)
_submission_ip_limit = ip_rate_limit(
    "public_submission", settings.public_submission_limit, settings.public_submission_window_seconds
)


def _load_public_form(repos: Repositories, event_slug: str, form_slug: str):
    event = repos.events.get_by_slug(event_slug)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    form = repos.forms.get_by_slug(event.id, form_slug)
    if form is None:
        raise HTTPException(status_code=404, detail="Form not found")
    return event, form


def _own_submission(repos: Repositories, user: User, submission_id: str):
    submission = repos.submissions.get(submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    if submission.submitter_person_id != user.person_id:
        raise HTTPException(status_code=403, detail="You can only edit your own submission")
    return submission


@router.get("/events", response_model=list[PublicEventSummary])
def list_public_events(repos: Repositories = Depends(get_repos)):
    """Every event with a published agenda.

    The attendee-facing URLs (/sessions, /agenda, …) carry no slug, so the
    frontend resolves them through this: one published event means go straight
    there, several means show a chooser.
    """
    return repos.events.list_published()


@router.get("/events/{event_slug}", response_model=PublicEventSummary)
def get_public_event(event_slug: str, repos: Repositories = Depends(get_repos)):
    event = repos.events.get_by_slug(event_slug)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return PublicEventSummary(
        id=event.id,
        name=event.name,
        slug=event.slug,
        description=event.description,
        location=event.location,
        timezone=event.timezone,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
    )


@router.get("/events/{event_slug}/program")
def get_public_program(event_slug: str, repos: Repositories = Depends(get_repos)):
    """Everything the public widgets render, in one unauthenticated payload.

    One endpoint rather than five so the sessions list, speakers list, agenda,
    itinerary and gallery are guaranteed to agree with each other (EMB-16), and
    so a widget costs one request instead of a waterfall.
    """
    event = repos.events.get_by_slug(event_slug)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return public_program_service.public_program(repos, event)


@router.get("/files/{file_id}/headshot")
def get_public_headshot(file_id: str, repos: Repositories = Depends(get_repos)):
    """Serve only headshots belonging to a speaker on the public programme."""
    file = repos.files.get(file_id)
    if file is None or file.file_type != "headshot" or not file.person_id:
        raise HTTPException(status_code=404, detail="Headshot not found")
    event = repos.events.get(file.event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    public_speaker_ids = {speaker["id"] for speaker in public_program_service.public_speakers(repos, event)}
    if file.person_id not in public_speaker_ids:
        raise HTTPException(status_code=404, detail="Headshot not found")
    file_obj, content = file_service.download(repos, file_id)
    return Response(
        content=content,
        media_type=file_obj.content_type,
        headers={"Content-Disposition": f'inline; filename="{file_obj.filename}"'},
    )


@router.get("/forms/{event_slug}/{form_slug}", response_model=PublicFormRead)
def get_public_form(event_slug: str, form_slug: str, repos: Repositories = Depends(get_repos)):
    event, form = _load_public_form(repos, event_slug, form_slug)
    return form_service.public_form_schema(event, form, repos)


@router.post(
    "/forms/{event_slug}/{form_slug}/auth/request-code",
    response_model=RequestCodeResponse,
    dependencies=[Depends(_request_code_ip_limit)],
)
def public_request_code(
    event_slug: str,
    form_slug: str,
    body: RequestCodeRequest,
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    _load_public_form(repos, event_slug, form_slug)
    check_rate_limit(
        db,
        f"auth_request_code:email:{body.email.lower().strip()}",
        limit=settings.auth_request_code_limit,
        window_seconds=settings.auth_request_code_window_seconds,
    )
    message, dev_code = auth_service.request_code(db, body.email)
    return RequestCodeResponse(message=message, dev_code=dev_code)


@router.post(
    "/forms/{event_slug}/{form_slug}/auth/verify",
    response_model=AuthUserRead,
    dependencies=[Depends(_verify_ip_limit)],
)
def public_verify(
    event_slug: str,
    form_slug: str,
    body: VerifyRequest,
    response: Response,
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    _load_public_form(repos, event_slug, form_slug)
    check_rate_limit(
        db,
        f"auth_verify:email:{body.email.lower().strip()}",
        limit=settings.auth_verify_limit,
        window_seconds=settings.auth_verify_window_seconds,
    )
    return auth_service.verify(
        db, repos, response, body.email, body.code, body.first_name, body.last_name
    )


@router.post(
    "/forms/{event_slug}/{form_slug}/submissions",
    response_model=SubmissionRead,
    status_code=201,
    dependencies=[Depends(_submission_ip_limit)],
)
def create_public_submission(
    event_slug: str,
    form_slug: str,
    body: SubmissionWrite,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    event, form = _load_public_form(repos, event_slug, form_slug)
    submission = submission_service.create_draft(db, repos, user, form, body)
    return submission_service.to_read(repos, submission)


@router.patch("/submissions/{submission_id}", response_model=SubmissionRead)
def update_public_submission(
    submission_id: str,
    body: SubmissionWrite,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    submission = _own_submission(repos, user, submission_id)
    submission = submission_service.update_draft(db, repos, submission, body)
    return submission_service.to_read(repos, submission)


@router.post("/submissions/{submission_id}/submit", response_model=SubmitResponse)
def submit_public_submission(
    submission_id: str,
    body: SubmissionWrite,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    submission = _own_submission(repos, user, submission_id)
    form = repos.forms.get(submission.form_id)
    if form is None:
        raise HTTPException(status_code=404, detail="Form not found")
    submitted = submission_service.submit(db, repos, form, submission, body)
    return SubmitResponse(id=submitted.id, status=submitted.status, message="Submission received.")
