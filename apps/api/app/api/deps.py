from collections.abc import Callable
from dataclasses import dataclass

from fastapi import Cookie, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db, utcnow
from app.core.security import hash_secret, verify_session
from app.models.auth import ApiKey, RoleBinding, User
from app.models.auth import Session as DBSession
from app.models.organization import OrganizationMembership
from app.models.program import Event
from app.repositories import Repositories, create_repositories

COOKIE_NAME = "session"


@dataclass
class Principal:
    kind: str  # "user" | "apikey"
    user: User | None = None
    api_key: ApiKey | None = None


def get_repos(db: Session = Depends(get_db)) -> Repositories:
    return create_repositories(db)


def _session_user(db: Session, request: Request) -> User | None:
    cookie = request.cookies.get(COOKIE_NAME)
    if not cookie:
        return None
    session_id = verify_session(cookie)
    if not session_id:
        return None
    db_session = db.get(DBSession, session_id)
    if db_session is None or db_session.expires_at < utcnow():
        return None
    return db.get(User, db_session.user_id)


def get_principal(request: Request, db: Session = Depends(get_db)) -> Principal:
    user = _session_user(db, request)
    if user is not None:
        return Principal(kind="user", user=user)

    authorization = request.headers.get("Authorization")
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        api_key = db.scalar(select(ApiKey).where(ApiKey.key_hash == hash_secret(token)))
        if api_key and (api_key.expires_at is None or api_key.expires_at > utcnow()):
            api_key.last_used_at = utcnow()
            db.commit()
            return Principal(kind="apikey", api_key=api_key)

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


def get_current_user(
    db: Session = Depends(get_db),
    session_cookie: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> User:
    if not session_cookie:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    session_id = verify_session(session_cookie)
    if not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")

    db_session = db.get(DBSession, session_id)
    if db_session is None or db_session.expires_at < utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    user = db.get(User, db_session.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def _authorize_event(
    db: Session, principal: Principal, event_id: str, roles: set[str], scope: str | None = None
) -> bool:
    if principal.kind == "user":
        event = db.get(Event, event_id)
        if event is not None and roles & {"owner", "admin"}:
            org_role = db.scalar(
                select(OrganizationMembership.role).where(
                    OrganizationMembership.organization_id == event.organization_id,
                    OrganizationMembership.user_id == principal.user.id,
                    OrganizationMembership.status == "active",
                )
            )
            if org_role in {"owner", "admin"}:
                return True
        bound_roles = set(
            db.scalars(
                select(RoleBinding.role).where(
                    RoleBinding.user_id == principal.user.id,
                    RoleBinding.event_id == event_id,
                )
            )
        )
        return bool(bound_roles & roles)
    key = principal.api_key
    if key is None or key.event_id != event_id:
        return False
    scopes = set(key.scopes or [])
    if "admin" in scopes or "events:write" in scopes:
        return True
    if roles & {"owner", "admin"}:
        return scope is not None and scope in scopes
    return True  # read access with a scoped key


def require_organization_role(*roles: str) -> Callable:
    def dependency(
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        from app.models.organization import Organization

        organization = db.scalar(select(Organization).order_by(Organization.created_at.asc()).limit(1))
        if organization is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
        membership = db.scalar(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == organization.id,
                OrganizationMembership.user_id == user.id,
                OrganizationMembership.status == "active",
            )
        )
        if membership is None or membership.role not in set(roles):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient organization permissions")
        return organization

    return dependency


def require_event_role(*roles: str, scope: str = "events:write") -> Callable:
    def dependency(
        event_id: str,
        principal: Principal = Depends(get_principal),
        repos: Repositories = Depends(get_repos),
        db: Session = Depends(get_db),
    ) -> str:
        event = repos.events.get(event_id)
        if event is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
        if not _authorize_event(db, principal, event_id, set(roles), scope):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return event_id

    return dependency


def resolve_event_role(db: Session, principal: Principal, event_id: str) -> str | None:
    """The caller's RoleBinding.role for this event, or None (user principals only).

    Used where a handler needs to branch on *which* role granted access (e.g. hiding
    speaker identity from reviewers under a blind-review evaluation plan) rather than
    just checking that access is allowed.
    """
    if principal.kind != "user" or principal.user is None:
        return None
    bound_roles = set(
        db.scalars(
            select(RoleBinding.role).where(
                RoleBinding.user_id == principal.user.id,
                RoleBinding.event_id == event_id,
            )
        )
    )
    for role in ("owner", "admin", "reviewer", "speaker"):
        if role in bound_roles:
            return role
    return None


def require_event_access(
    event_id: str,
    principal: Principal = Depends(get_principal),
    repos: Repositories = Depends(get_repos),
    db: Session = Depends(get_db),
) -> str:
    event = repos.events.get(event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if not _authorize_event(db, principal, event_id, {"owner", "admin", "reviewer", "speaker"}):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    return event_id


def require_form_role(*roles: str) -> Callable:
    """Resolve a form by id and require an event role on its event."""

    def dependency(
        form_id: str,
        principal: Principal = Depends(get_principal),
        repos: Repositories = Depends(get_repos),
        db: Session = Depends(get_db),
    ) -> str:
        form = repos.forms.get(form_id)
        if form is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")
        if not _authorize_event(db, principal, form.event_id, set(roles)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return form_id

    return dependency


def require_submission_access(
    submission_id: str,
    principal: Principal = Depends(get_principal),
    repos: Repositories = Depends(get_repos),
    db: Session = Depends(get_db),
) -> str:
    submission = repos.submissions.get(submission_id)
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    if principal.kind == "apikey":
        if _authorize_event(db, principal, submission.event_id, {"owner", "admin"}, "submissions:read"):
            return submission_id
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    user = principal.user
    bindings = set(
        db.scalars(
            select(RoleBinding.role).where(
                RoleBinding.user_id == user.id,
                RoleBinding.event_id == submission.event_id,
            )
        )
    )
    if bindings & {"owner", "admin"}:
        return submission_id
    if "reviewer" in bindings and user.person_id:
        if repos.review_assignments.get_for(submission_id, user.person_id) is not None:
            return submission_id
    if "speaker" in bindings and user.person_id:
        involved_ids = {item.id for item in repos.submissions.list_involving_person(user.person_id)}
        if submission_id in involved_ids:
            return submission_id
    # Use 404 for scoped records so an authenticated user cannot enumerate IDs.
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")


def require_submission_role(*roles: str) -> Callable:
    """Resolve a submission and require an organizer role on its event."""

    def dependency(
        submission_id: str,
        principal: Principal = Depends(get_principal),
        repos: Repositories = Depends(get_repos),
        db: Session = Depends(get_db),
    ) -> str:
        submission = repos.submissions.get(submission_id)
        if submission is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
        if not _authorize_event(db, principal, submission.event_id, set(roles), "submissions:write"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return submission_id

    return dependency


def require_person(user: User = Depends(get_current_user)) -> str:
    if not user.person_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No person identity linked")
    return user.person_id


def require_plan_role(*roles: str) -> Callable:
    """Resolve an evaluation plan by id and require an event role on its event."""

    def dependency(
        plan_id: str,
        principal: Principal = Depends(get_principal),
        repos: Repositories = Depends(get_repos),
        db: Session = Depends(get_db),
    ) -> str:
        plan = repos.evaluation_plans.get(plan_id)
        if plan is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation plan not found")
        if not _authorize_event(db, principal, plan.event_id, set(roles)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return plan_id

    return dependency


def require_plan_access(
    plan_id: str,
    principal: Principal = Depends(get_principal),
    repos: Repositories = Depends(get_repos),
    db: Session = Depends(get_db),
) -> str:
    """Allow organizers or a reviewer who has an assignment on this plan."""
    plan = repos.evaluation_plans.get(plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation plan not found")
    if _authorize_event(db, principal, plan.event_id, {"owner", "admin"}, "evaluations:read"):
        return plan_id
    if principal.kind == "user" and principal.user and principal.user.person_id:
        assignments = repos.review_assignments.list_for_reviewer(principal.user.person_id)
        if any(item.evaluation_plan_id == plan_id for item in assignments):
            return plan_id
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation plan not found")


def require_session_role(*roles: str, scope: str | None = None) -> Callable:
    """Resolve a session by id and require an event role on its event."""

    def dependency(
        session_id: str,
        principal: Principal = Depends(get_principal),
        repos: Repositories = Depends(get_repos),
        db: Session = Depends(get_db),
    ) -> str:
        session = repos.sessions.get(session_id)
        if session is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        if not _authorize_event(db, principal, session.event_id, set(roles), scope):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return session_id

    return dependency


def require_task_template_role(*roles: str) -> Callable:
    def dependency(
        template_id: str,
        principal: Principal = Depends(get_principal),
        repos: Repositories = Depends(get_repos),
        db: Session = Depends(get_db),
    ) -> str:
        template = repos.task_templates.get(template_id)
        if template is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task template not found")
        if not _authorize_event(db, principal, template.event_id, set(roles)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return template_id

    return dependency


def require_task_assignment_role(*roles: str) -> Callable:
    def dependency(
        assignment_id: str,
        principal: Principal = Depends(get_principal),
        repos: Repositories = Depends(get_repos),
        db: Session = Depends(get_db),
    ) -> str:
        assignment = repos.task_assignments.get(assignment_id)
        if assignment is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task assignment not found")
        if not _authorize_event(db, principal, assignment.event_id, set(roles)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return assignment_id

    return dependency


def require_saved_view_role(*roles: str) -> Callable:
    def dependency(
        view_id: str,
        principal: Principal = Depends(get_principal),
        repos: Repositories = Depends(get_repos),
        db: Session = Depends(get_db),
    ) -> str:
        view = repos.saved_views.get(view_id)
        if view is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved view not found")
        if not _authorize_event(db, principal, view.event_id, set(roles)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return view_id

    return dependency


def require_portal_form_role(*roles: str) -> Callable:
    def dependency(
        form_id: str,
        principal: Principal = Depends(get_principal),
        repos: Repositories = Depends(get_repos),
        db: Session = Depends(get_db),
    ) -> str:
        form = repos.portal_forms.get(form_id)
        if form is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portal form not found")
        if not _authorize_event(db, principal, form.event_id, set(roles)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return form_id

    return dependency


def require_portal_resource_role(*roles: str) -> Callable:
    def dependency(
        resource_id: str,
        principal: Principal = Depends(get_principal),
        repos: Repositories = Depends(get_repos),
        db: Session = Depends(get_db),
    ) -> str:
        resource = repos.portal_resources.get(resource_id)
        if resource is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
        if not _authorize_event(db, principal, resource.event_id, set(roles)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return resource_id

    return dependency


def require_field_definition_role(*roles: str) -> Callable:
    def dependency(
        field_id: str,
        principal: Principal = Depends(get_principal),
        repos: Repositories = Depends(get_repos),
        db: Session = Depends(get_db),
    ) -> str:
        field = repos.field_definitions.get(field_id)
        if field is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field definition not found")
        if not _authorize_event(db, principal, field.event_id, set(roles)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return field_id

    return dependency


def require_file_request_role(*roles: str) -> Callable:
    def dependency(
        request_id: str,
        principal: Principal = Depends(get_principal),
        repos: Repositories = Depends(get_repos),
        db: Session = Depends(get_db),
    ) -> str:
        request = repos.file_requests.get(request_id)
        if request is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File request not found")
        if not _authorize_event(db, principal, request.event_id, set(roles)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return request_id

    return dependency
