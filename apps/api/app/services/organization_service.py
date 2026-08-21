import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.blob_storage import BlobStorage
from app.core.config import settings
from app.core.security import hash_secret
from app.email import EmailMessageInput, send_email
from app.email.templates import organization_invitation_email
from app.models.auth import AuditEvent, User
from app.models.organization import Organization, OrganizationInvitation, OrganizationMembership
from app.schemas.organization import OrganizationCreate, OrganizationUpdate

INVITATION_TTL_DAYS = 14
LOGO_MAX_BYTES = 2 * 1024 * 1024
LOGO_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}


def now() -> datetime:
    return datetime.now(UTC)


def current(db: Session) -> Organization | None:
    """The deployment's one organization. Single-org mode's implementation of
    "the" org; also multi-org mode's escape hatch for background jobs that
    want every org (see list_all_organizations)."""
    return db.scalar(select(Organization).order_by(Organization.created_at.asc()).limit(1))


def resolve_active(db: Session, user: User) -> Organization | None:
    """The calling user's active organization.

    Single-org mode: identical to current() — there's only ever one answer.
    Multi-org mode: the user's active_organization_id if still a member,
    else their oldest active membership (cached back onto the user), else
    None if they belong to no organization yet.
    """
    if not settings.multi_org_enabled:
        return current(db)

    if user.active_organization_id:
        organization = db.get(Organization, user.active_organization_id)
        if organization is not None and membership(db, user.id, organization.id) is not None:
            return organization

    member = db.scalar(
        select(OrganizationMembership)
        .where(OrganizationMembership.user_id == user.id, OrganizationMembership.status == "active")
        .order_by(OrganizationMembership.created_at.asc())
    )
    if member is None:
        return None
    organization = db.get(Organization, member.organization_id)
    user.active_organization_id = organization.id
    db.commit()
    return organization


def set_active(db: Session, user: User, organization_id: str) -> Organization:
    """Switch the user's active organization (multi-org mode). 403s if
    they're not actually a member of it."""
    organization = db.get(Organization, organization_id)
    if organization is None or membership(db, user.id, organization_id) is None:
        raise HTTPException(status_code=403, detail="Not a member of this organization.")
    user.active_organization_id = organization_id
    db.commit()
    return organization


def list_my_organizations(db: Session, user: User) -> list[tuple[Organization, OrganizationMembership]]:
    """Every organization the user belongs to, with their role in each, oldest first."""
    rows = db.execute(
        select(Organization, OrganizationMembership)
        .join(OrganizationMembership, OrganizationMembership.organization_id == Organization.id)
        .where(OrganizationMembership.user_id == user.id, OrganizationMembership.status == "active")
        .order_by(OrganizationMembership.created_at.asc())
    ).all()
    return [(org, member) for org, member in rows]


def list_all_organizations(db: Session) -> list[Organization]:
    """Every organization in the deployment, for background jobs (reminders).

    Single-org mode: the same 0-or-1-element list current() implies today.
    """
    if not settings.multi_org_enabled:
        organization = current(db)
        return [organization] if organization else []
    return list(db.scalars(select(Organization).order_by(Organization.created_at.asc())))


def membership(db: Session, user_id: str, organization_id: str | None = None) -> OrganizationMembership | None:
    stmt = select(OrganizationMembership).where(
        OrganizationMembership.user_id == user_id,
        OrganizationMembership.status == "active",
    )
    if organization_id:
        stmt = stmt.where(OrganizationMembership.organization_id == organization_id)
    return db.scalar(stmt)


def bootstrap(db: Session, user: User, payload: OrganizationCreate) -> Organization:
    if settings.multi_org_enabled:
        # Open self-serve: anyone with no organization of their own yet may
        # create one. Belonging to an existing org (owner, admin, or member)
        # blocks creating a second — use an invite or /organization/active
        # to switch, not another bootstrap.
        already_member = membership(db, user.id)
        if already_member is not None:
            raise HTTPException(status_code=409, detail="You already belong to an organization.")
    else:
        existing = current(db)
        if existing is not None:
            raise HTTPException(status_code=409, detail="This deployment already has an organization.")
    duplicate_slug = db.scalar(select(Organization).where(Organization.slug == payload.slug))
    if duplicate_slug:
        raise HTTPException(status_code=409, detail="Organization slug is already in use.")

    organization = Organization(created_by=user.id, **payload.model_dump())
    db.add(organization)
    try:
        db.flush()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="This deployment already has an organization.") from error
    db.add(OrganizationMembership(organization_id=organization.id, user_id=user.id, role="owner"))
    if settings.multi_org_enabled:
        user.active_organization_id = organization.id
    db.add(AuditEvent(user_id=user.id, action="organization.created", payload={"name": organization.name}))
    db.commit()
    db.refresh(organization)
    return organization


def _eval_organization(db: Session, user: User) -> Organization:
    """Get-or-create the dedicated evaluation-mode organization and grant this
    persona admin on it, idempotently.

    Evaluation personas (organizer/speaker/reviewer, see auth.py) always land
    in their own fixed-slug org rather than "whichever org happens to exist" —
    that made the old carve-out only work by accident, since a fresh eval
    environment happened to have exactly one org. This keeps evaluation_mode
    behaving identically whether multi_org_enabled is on or off.
    """
    organization = db.scalar(select(Organization).where(Organization.slug == "evaluation-workspace"))
    if organization is None:
        organization = Organization(
            created_by=user.id, name="Evaluation Workspace", slug="evaluation-workspace", default_timezone="UTC"
        )
        db.add(organization)
        db.flush()
    if membership(db, user.id, organization.id) is None:
        db.add(OrganizationMembership(organization_id=organization.id, user_id=user.id, role="admin"))
        db.commit()
    return organization


def ensure_for_event_creation(db: Session, user: User) -> Organization:
    """API-safe bootstrap for scripts; the web UI normally performs guided onboarding."""
    if settings.evaluation_mode:
        organization = _eval_organization(db, user)
    else:
        organization = resolve_active(db, user)
        if organization is None:
            if settings.multi_org_enabled:
                organization = bootstrap(db, user, _personal_workspace(db, user))
            else:
                organization = bootstrap(
                    db,
                    user,
                    OrganizationCreate(name="Open Session Workspace", slug="workspace", default_timezone="UTC"),
                )
    member = membership(db, user.id, organization.id)
    if member is None and settings.environment == "development" and not settings.evaluation_mode:
        # Local tests historically create isolated events from several
        # organizer emails. Production never grants this implicitly.
        member = OrganizationMembership(
            organization_id=organization.id,
            user_id=user.id,
            role="admin",
        )
        db.add(member)
        db.commit()
    if member is None or member.role not in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail="Organization owner or admin access required.")
    return organization


def _personal_workspace(db: Session, user: User) -> OrganizationCreate:
    """A default org name/slug for a multi-org user who reached event creation
    without ever going through onboarding (e.g. scripted/API-first usage)."""
    base = user.email.split("@", 1)[0].lower() or "workspace"
    slug = base
    suffix = 1
    while db.scalar(select(Organization).where(Organization.slug == slug)) is not None:
        suffix += 1
        slug = f"{base}-{suffix}"
    return OrganizationCreate(name=f"{base}'s workspace", slug=slug, default_timezone="UTC")


def update(db: Session, user: User, organization: Organization, payload: OrganizationUpdate) -> Organization:
    patch = payload.model_dump(exclude_unset=True)
    if "slug" in patch:
        duplicate = db.scalar(
            select(Organization).where(Organization.slug == patch["slug"], Organization.id != organization.id)
        )
        if duplicate:
            raise HTTPException(status_code=409, detail="Organization slug is already in use.")
    for key, value in patch.items():
        setattr(organization, key, value)
    db.add(
        AuditEvent(
            user_id=user.id,
            action="organization.updated",
            payload={"changed_fields": sorted(patch)},
        )
    )
    db.commit()
    db.refresh(organization)
    return organization


def list_members(db: Session, organization_id: str) -> list[dict]:
    rows = db.execute(
        select(OrganizationMembership, User)
        .join(User, User.id == OrganizationMembership.user_id)
        .where(OrganizationMembership.organization_id == organization_id)
        .order_by(OrganizationMembership.created_at.asc())
    ).all()
    return [
        {
            "user_id": member.user_id,
            "email": user.email,
            "role": member.role,
            "status": member.status,
            "created_at": member.created_at,
        }
        for member, user in rows
    ]


def _invitation_status(invitation: OrganizationInvitation) -> str:
    if invitation.revoked_at:
        return "revoked"
    if invitation.accepted_at:
        return "accepted"
    if invitation.expires_at < now():
        return "expired"
    return "pending"


def invitation_view(invitation: OrganizationInvitation) -> dict:
    return {
        "id": invitation.id,
        "email": invitation.email,
        "role": invitation.role,
        "status": _invitation_status(invitation),
        "expires_at": invitation.expires_at,
        "created_at": invitation.created_at,
        "invite_url": None,
    }


def list_invitations(db: Session, organization_id: str) -> list[dict]:
    invitations = db.scalars(
        select(OrganizationInvitation)
        .where(OrganizationInvitation.organization_id == organization_id)
        .order_by(OrganizationInvitation.created_at.desc())
    ).all()
    return [invitation_view(item) for item in invitations]


def _send_invitation(organization: Organization, invitation: OrganizationInvitation, inviter: User, token: str) -> str:
    invite_url = f"{settings.web_app_url.rstrip('/')}/invitations/accept?token={token}"
    rendered = organization_invitation_email(
        organization_name=organization.name,
        inviter_email=inviter.email,
        role=invitation.role,
        invite_url=invite_url,
    )
    send_email(
        EmailMessageInput(
            to=invitation.email,
            subject=rendered.subject,
            html=rendered.html,
            text=rendered.text,
        )
    )
    return invite_url


def invite(db: Session, organization: Organization, inviter: User, email: str, role: str) -> dict:
    normalized = email.lower().strip()
    existing_user = db.scalar(select(User).where(User.email == normalized))
    if existing_user and membership(db, existing_user.id, organization.id):
        raise HTTPException(status_code=409, detail="That person is already an organization member.")

    active = db.scalar(
        select(OrganizationInvitation).where(
            OrganizationInvitation.organization_id == organization.id,
            OrganizationInvitation.email == normalized,
            OrganizationInvitation.accepted_at.is_(None),
            OrganizationInvitation.revoked_at.is_(None),
        )
    )
    if active and active.expires_at >= now():
        raise HTTPException(status_code=409, detail="A pending invitation already exists for this email.")

    token = secrets.token_urlsafe(32)
    invitation = OrganizationInvitation(
        organization_id=organization.id,
        email=normalized,
        role=role,
        token_hash=hash_secret(token),
        invited_by=inviter.id,
        expires_at=now() + timedelta(days=INVITATION_TTL_DAYS),
    )
    db.add(invitation)
    db.flush()
    invite_url = _send_invitation(organization, invitation, inviter, token)
    db.add(
        AuditEvent(
            user_id=inviter.id,
            action="organization.invitation.created",
            payload={"invitation_id": invitation.id, "email": normalized, "role": role},
        )
    )
    db.commit()
    view = invitation_view(invitation)
    view["invite_url"] = invite_url if not settings.email_enabled else None
    return view


def resend_invitation(db: Session, organization: Organization, inviter: User, invitation_id: str) -> dict:
    invitation = db.get(OrganizationInvitation, invitation_id)
    if invitation is None or invitation.organization_id != organization.id:
        raise HTTPException(status_code=404, detail="Invitation not found.")
    if invitation.accepted_at:
        raise HTTPException(status_code=409, detail="Invitation has already been accepted.")
    token = secrets.token_urlsafe(32)
    invitation.token_hash = hash_secret(token)
    invitation.expires_at = now() + timedelta(days=INVITATION_TTL_DAYS)
    invitation.revoked_at = None
    invite_url = _send_invitation(organization, invitation, inviter, token)
    db.commit()
    view = invitation_view(invitation)
    view["invite_url"] = invite_url if not settings.email_enabled else None
    return view


def revoke_invitation(db: Session, organization: Organization, invitation_id: str) -> None:
    invitation = db.get(OrganizationInvitation, invitation_id)
    if invitation is None or invitation.organization_id != organization.id:
        raise HTTPException(status_code=404, detail="Invitation not found.")
    if invitation.accepted_at:
        raise HTTPException(status_code=409, detail="Accepted invitations cannot be revoked.")
    invitation.revoked_at = now()
    db.commit()


def _accept(db: Session, user: User, invitation: OrganizationInvitation) -> OrganizationMembership:
    status = _invitation_status(invitation)
    if status != "pending":
        raise HTTPException(status_code=409, detail=f"Invitation is {status}.")
    if invitation.email != user.email.lower().strip():
        raise HTTPException(status_code=403, detail="Sign in with the email address that received this invitation.")

    member = membership(db, user.id, invitation.organization_id)
    if member is None:
        member = OrganizationMembership(
            organization_id=invitation.organization_id,
            user_id=user.id,
            role=invitation.role,
        )
        db.add(member)
    else:
        member.role = invitation.role
        member.status = "active"
    invitation.accepted_at = now()
    if settings.multi_org_enabled:
        user.active_organization_id = invitation.organization_id
    db.add(
        AuditEvent(
            user_id=user.id,
            action="organization.invitation.accepted",
            payload={"invitation_id": invitation.id, "organization_id": invitation.organization_id},
        )
    )
    db.commit()
    db.refresh(member)
    return member


def accept_invitation(db: Session, user: User, raw_token: str) -> OrganizationMembership:
    """Accept via the token from the invitation email — the link anyone (not
    yet necessarily signed in) lands on."""
    invitation = db.scalar(
        select(OrganizationInvitation).where(OrganizationInvitation.token_hash == hash_secret(raw_token))
    )
    if invitation is None:
        raise HTTPException(status_code=404, detail="Invitation not found.")
    return _accept(db, user, invitation)


def accept_invitation_by_id(db: Session, user: User, invitation_id: str) -> OrganizationMembership:
    """Accept one of the caller's own pending invitations (see
    list_my_pending_invitations) without needing its token — the caller is
    already authenticated, and _accept still requires their email to match
    the invitation's, which is the same guarantee the token proves."""
    invitation = db.get(OrganizationInvitation, invitation_id)
    if invitation is None:
        raise HTTPException(status_code=404, detail="Invitation not found.")
    return _accept(db, user, invitation)


def list_my_pending_invitations(db: Session, user: User) -> list[tuple[OrganizationInvitation, Organization]]:
    email = user.email.lower().strip()
    rows = db.execute(
        select(OrganizationInvitation, Organization)
        .join(Organization, Organization.id == OrganizationInvitation.organization_id)
        .where(
            OrganizationInvitation.email == email,
            OrganizationInvitation.accepted_at.is_(None),
            OrganizationInvitation.revoked_at.is_(None),
            OrganizationInvitation.expires_at >= now(),
        )
        .order_by(OrganizationInvitation.created_at.desc())
    ).all()
    return [(invitation, org) for invitation, org in rows]


def remove_member(db: Session, organization: Organization, requesting_user: User, user_id: str) -> None:
    member = membership(db, user_id, organization.id)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found.")
    if member.role == "owner":
        raise HTTPException(status_code=400, detail="The organization owner cannot be removed.")
    db.delete(member)
    db.add(
        AuditEvent(
            user_id=requesting_user.id,
            action="organization.member.removed",
            payload={"removed_user_id": user_id},
        )
    )
    db.commit()


def pending_invitation_count(db: Session, email: str) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(OrganizationInvitation)
            .where(
                OrganizationInvitation.email == email.lower().strip(),
                OrganizationInvitation.accepted_at.is_(None),
                OrganizationInvitation.revoked_at.is_(None),
                OrganizationInvitation.expires_at >= now(),
            )
        )
        or 0
    )


def logo_storage_key(organization: Organization) -> str:
    return f"organization/{organization.id}"


async def store_logo(
    db: Session,
    storage: BlobStorage,
    organization: Organization,
    content: bytes,
    content_type: str,
    filename: str,
) -> None:
    mime = content_type.split(";", 1)[0].lower()
    if mime not in LOGO_TYPES:
        raise HTTPException(status_code=400, detail="Organization logos must be PNG, JPEG, or WebP.")
    if not content or len(content) > LOGO_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Organization logo must be smaller than 2 MB.")
    valid = (
        mime == "image/png" and content.startswith(b"\x89PNG")
        or mime == "image/jpeg" and content.startswith(b"\xff\xd8\xff")
        or mime == "image/webp" and len(content) >= 12 and content.startswith(b"RIFF") and content[8:12] == b"WEBP"
    )
    if not valid:
        raise HTTPException(status_code=400, detail="Logo contents do not match the selected image type.")
    await storage.put(logo_storage_key(organization), content)
    organization.logo_filename = filename[:255]
    organization.logo_content_type = mime
    db.commit()
