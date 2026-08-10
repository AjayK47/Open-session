from fastapi import APIRouter, Cookie, Depends, Response
from sqlalchemy.orm import Session

from app.api.deps import COOKIE_NAME, get_current_user, get_repos
from app.core.config import settings
from app.core.db import get_db
from app.core.rate_limit import check_rate_limit, ip_device_rate_limit, ip_rate_limit
from app.models.auth import User
from app.repositories import Repositories
from app.schemas.auth import (
    AuthUserRead,
    EvaluationLoginRequest,
    EvaluationPersonaRead,
    RequestCodeRequest,
    RequestCodeResponse,
    VerifyRequest,
)
from app.services import auth_service

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

_EVALUATION_PERSONAS = {
    "organizer": ("Organizer", lambda: settings.evaluation_organizer_email, lambda: "/app/events"),
    "speaker": (
        "Speaker",
        lambda: settings.evaluation_speaker_email,
        lambda: f"/portal/{settings.evaluation_event_slug}",
    ),
    "reviewer": (
        "Reviewer",
        lambda: settings.evaluation_reviewer_email,
        lambda: f"/review/{settings.evaluation_event_slug}",
    ),
}

_request_code_ip_limit = ip_device_rate_limit(
    "auth_request_code",
    ip_limit=settings.auth_request_code_ip_limit,
    device_limit=settings.auth_request_code_device_limit,
    window_seconds=settings.auth_request_code_window_seconds,
)
_verify_ip_limit = ip_rate_limit("auth_verify", settings.auth_verify_limit, settings.auth_verify_window_seconds)


@router.post(
    "/request-code",
    response_model=RequestCodeResponse,
    dependencies=[Depends(_request_code_ip_limit)],
)
def request_code(body: RequestCodeRequest, db: Session = Depends(get_db)) -> RequestCodeResponse:
    check_rate_limit(
        db,
        f"auth_request_code:email:{body.email.lower().strip()}",
        limit=settings.auth_request_code_limit,
        window_seconds=settings.auth_request_code_window_seconds,
    )
    message, dev_code = auth_service.request_code(db, body.email)
    return RequestCodeResponse(message=message, dev_code=dev_code)


@router.post(
    "/verify",
    response_model=AuthUserRead,
    dependencies=[Depends(_verify_ip_limit)],
)
def verify(
    body: VerifyRequest,
    response: Response,
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> AuthUserRead:
    check_rate_limit(
        db,
        f"auth_verify:email:{body.email.lower().strip()}",
        limit=settings.auth_verify_limit,
        window_seconds=settings.auth_verify_window_seconds,
    )
    return auth_service.verify(
        db, repos, response, body.email, body.code, body.first_name, body.last_name
    )


@router.post("/logout")
def logout(
    response: Response,
    session_cookie: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    if session_cookie:
        from app.core.security import verify_session
        from app.models.auth import Session as DBSession

        session_id = verify_session(session_cookie)
        if session_id:
            session = db.get(DBSession, session_id)
            if session is not None:
                db.delete(session)
                db.commit()
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@router.get("/me", response_model=AuthUserRead)
def me(user: User = Depends(get_current_user)) -> AuthUserRead:
    return AuthUserRead.model_validate(user)


@router.get("/evaluation-personas", response_model=list[EvaluationPersonaRead])
def evaluation_personas() -> list[EvaluationPersonaRead]:
    if not settings.evaluation_mode:
        return []
    return [
        EvaluationPersonaRead(persona=persona, label=label, email=get_email(), start_path=get_start_path())
        for persona, (label, get_email, get_start_path) in _EVALUATION_PERSONAS.items()
    ]


@router.post("/evaluation-login", response_model=AuthUserRead)
def evaluation_login(
    body: EvaluationLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthUserRead:
    _, get_email, _ = _EVALUATION_PERSONAS[body.persona]
    return auth_service.evaluation_login(db, response, get_email())
