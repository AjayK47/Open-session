from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import constant_time_equals, new_code, sign_session
from app.email import EmailMessageInput, send_email
from app.models.auth import LoginToken, RoleBinding, User
from app.models.auth import Session as DBSession
from app.repositories import Repositories
from app.schemas.auth import AuthUserRead

COOKIE_NAME = "session"


def _now() -> datetime:
    return datetime.now(UTC)


def _set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=sign_session(session_id),
        max_age=settings.session_max_age_seconds,
        httponly=True,
        secure=settings.environment != "development",
        samesite="lax",
        path="/",
    )


def request_code(db: Session, raw_email: str) -> tuple[str, str | None]:
    email = raw_email.lower().strip()
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email)
        db.add(user)
        db.flush()

    code = new_code()
    token = LoginToken(
        user_id=user.id,
        email=email,
        code=code,
        expires_at=_now() + timedelta(seconds=settings.login_token_ttl_seconds),
    )
    db.add(token)
    db.commit()

    if settings.email_enabled:
        send_email(
            EmailMessageInput(
                to=email,
                subject="Your sign-in code",
                text=(
                    f"Your Open Session sign-in code is {code}.\n\n"
                    f"It expires in {settings.login_token_ttl_seconds // 60} minutes."
                ),
            )
        )
        return "If that email is registered, a sign-in code has been sent.", None

    # Handing the code back in the response is only safe when we've deliberately
    # relaxed auth for local dev or a graded demo. Without this guard, a real
    # deployment that simply forgot to configure email would hand out anyone's
    # sign-in code to anyone who typed their address — account takeover by design.
    if settings.environment == "development" or settings.evaluation_mode:
        return "Code generated (email delivery disabled).", code

    return "If that email is registered, a sign-in code has been sent.", None


def verify(
    db: Session,
    repos: Repositories,
    response: Response,
    raw_email: str,
    code: str,
    first_name: str | None = None,
    last_name: str | None = None,
) -> AuthUserRead:
    email = raw_email.lower().strip()
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        raise HTTPException(status_code=400, detail="No sign-in request for this email.")

    stmt = (
        select(LoginToken)
        .where(LoginToken.user_id == user.id, LoginToken.email == email, LoginToken.consumed_at.is_(None))
        .order_by(LoginToken.created_at.desc())
    )
    tokens = list(db.scalars(stmt))
    token = next((t for t in tokens if constant_time_equals(t.code, code)), None)
    if token is None:
        raise HTTPException(status_code=400, detail="Invalid code.")

    now = _now()
    if token.expires_at < now:
        raise HTTPException(status_code=400, detail="Code expired. Request a new one.")

    token.consumed_at = now

    # Every verified user is backed by a shared Person identity record (§9.2).
    person = repos.people.upsert_by_email(email, {})
    # Fill the name only when we do not already have one. Sign-in and sign-up are
    # the same flow here, so a returning speaker must not have the profile they
    # curated overwritten by whatever was typed at the login box.
    if first_name and not person.first_name:
        person.first_name = first_name.strip() or None
    if last_name and not person.last_name:
        person.last_name = last_name.strip() or None
    user.person_id = person.id

    db_session = DBSession(user_id=user.id, expires_at=now + timedelta(seconds=settings.session_max_age_seconds))
    db.add(db_session)
    db.commit()

    _set_session_cookie(response, db_session.id)
    return AuthUserRead.model_validate(user)


def evaluation_login(db: Session, response: Response, email: str) -> AuthUserRead:
    """Create a session for a pre-seeded evaluator persona.

    This deliberately refuses to create users: enabling evaluation mode without
    first running the deterministic seed must not turn into an arbitrary-account
    login bypass.
    """
    if not settings.evaluation_mode:
        raise HTTPException(status_code=404, detail="Not found")

    user = db.scalar(select(User).where(User.email == email.lower().strip()))
    if user is None:
        raise HTTPException(status_code=409, detail="Evaluation persona has not been seeded")

    now = _now()
    db_session = DBSession(user_id=user.id, expires_at=now + timedelta(seconds=settings.session_max_age_seconds))
    db.add(db_session)
    db.commit()
    _set_session_cookie(response, db_session.id)
    return AuthUserRead.model_validate(user)


def has_role(db: Session, user_id: str, event_id: str, roles: set[str]) -> bool:
    return db.scalar(
        select(RoleBinding).where(
            RoleBinding.user_id == user_id,
            RoleBinding.event_id == event_id,
            RoleBinding.role.in_(roles),
        )
    ) is not None


def add_role(db: Session, user_id: str, event_id: str, role: str) -> None:
    db.add(RoleBinding(user_id=user_id, event_id=event_id, role=role))
    db.flush()
