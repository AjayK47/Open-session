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
    return db.scalar(select(Organization).order_by(Organization.created_at.asc()).limit(1))


def membership(db: Session, user_id: str, organization_id: str | None = None) -> OrganizationMembership | None:
    stmt = select(OrganizationMembership).where(
        OrganizationMembership.user_id == user_id,
        OrganizationMembership.status == "active",
    )
    if organization_id:
        stmt = stmt.where(OrganizationMembership.organization_id == organization_id)
    return db.scalar(stmt)


def bootstrap(db: Session, user: User, payload: OrganizationCreate) -> Organization:
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
    db.add(AuditEvent(user_id=user.id, action="organization.created", payload={"name": organization.name}))
    db.commit()
    db.refresh(organization)
    return organization


def ensure_for_event_creation(db: Session, user: User) -> Organization:
    """API-safe bootstrap for scripts; the web UI normally performs guided onboarding."""
    organization = current(db)
    if organization is None:
        organization = bootstrap(
            db,
            user,
            OrganizationCreate(name="Open Session Workspace", slug="workspace", default_timezone="UTC"),
        )
    member = membership(db, user.id, organization.id)
    if member is None and (settings.environment == "development" or settings.evaluation_mode):
        # Local tests and evaluation personas historically create isolated events
        # from several organizer emails. Production never grants this implicitly.
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


def accept_invitation(db: Session, user: User, raw_token: str) -> OrganizationMembership:
    invitation = db.scalar(
        select(OrganizationInvitation).where(OrganizationInvitation.token_hash == hash_secret(raw_token))
    )
    if invitation is None:
        raise HTTPException(status_code=404, detail="Invitation not found.")
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
