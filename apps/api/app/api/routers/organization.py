from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_organization_role
from app.core.blob_storage import BlobStorage, get_blob_storage
from app.core.db import get_db
from app.models.auth import User
from app.models.organization import Organization
from app.schemas.organization import (
    MyInvitationRead,
    OrganizationContext,
    OrganizationCreate,
    OrganizationInvitationRead,
    OrganizationInviteCreate,
    OrganizationMemberRead,
    OrganizationRead,
    OrganizationUpdate,
    OrgSummary,
    SetActiveOrganization,
)
from app.services import organization_service

router = APIRouter(prefix="/api/v1/organization", tags=["organization"])


def _read(organization: Organization) -> dict:
    return {
        "id": organization.id,
        "name": organization.name,
        "slug": organization.slug,
        "website_url": organization.website_url,
        "description": organization.description,
        "default_timezone": organization.default_timezone,
        "logo_url": f"/api/v1/organization/logo?v={organization.updated_at.timestamp()}"
        if organization.logo_filename
        else None,
        "created_at": organization.created_at,
        "updated_at": organization.updated_at,
    }


@router.get("/context", response_model=OrganizationContext)
def context(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    organization = organization_service.resolve_active(db, user)
    member = organization_service.membership(db, user.id, organization.id) if organization else None
    mine = organization_service.list_my_organizations(db, user)
    return {
        "organization": _read(organization) if organization and member else None,
        "membership_role": member.role if member else None,
        "needs_onboarding": organization is None,
        "pending_invitation_count": organization_service.pending_invitation_count(db, user.email),
        "organizations": [
            OrgSummary(id=org.id, name=org.name, slug=org.slug, role=m.role) for org, m in mine
        ],
    }


@router.get("/mine", response_model=list[OrgSummary])
def list_mine(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [
        OrgSummary(id=org.id, name=org.name, slug=org.slug, role=m.role)
        for org, m in organization_service.list_my_organizations(db, user)
    ]


@router.post("/active", response_model=OrganizationContext)
def set_active_organization(
    body: SetActiveOrganization,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    organization_service.set_active(db, user, body.organization_id)
    return context(user, db)


@router.get("/invitations/mine", response_model=list[MyInvitationRead])
def list_my_invitations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = organization_service.list_my_pending_invitations(db, user)
    return [
        MyInvitationRead(id=inv.id, organization_name=org.name, role=inv.role, expires_at=inv.expires_at)
        for inv, org in rows
    ]


@router.post("/invitations/{invitation_id}/accept-mine")
def accept_my_invitation(
    invitation_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member = organization_service.accept_invitation_by_id(db, user, invitation_id)
    organization = db.get(Organization, member.organization_id)
    return {"organization": _read(organization), "membership_role": member.role}


@router.post("", response_model=OrganizationRead, status_code=201)
def create_organization(
    body: OrganizationCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _read(organization_service.bootstrap(db, user, body))


@router.get("", response_model=OrganizationRead)
def get_organization(organization: Organization = Depends(require_organization_role("owner", "admin", "member"))):
    return _read(organization)


@router.patch("", response_model=OrganizationRead)
def update_organization(
    body: OrganizationUpdate,
    organization: Organization = Depends(require_organization_role("owner", "admin")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _read(organization_service.update(db, user, organization, body))


@router.post("/logo", status_code=204)
async def upload_logo(
    request: Request,
    x_filename: str = Header(default="logo"),
    organization: Organization = Depends(require_organization_role("owner", "admin")),
    db: Session = Depends(get_db),
    storage: BlobStorage = Depends(get_blob_storage),
):
    await organization_service.store_logo(
        db,
        storage,
        organization,
        await request.body(),
        request.headers.get("content-type", ""),
        x_filename,
    )


@router.get("/logo")
async def get_logo(
    organization: Organization = Depends(require_organization_role("owner", "admin", "member")),
    storage: BlobStorage = Depends(get_blob_storage),
):
    content = await storage.get(organization_service.logo_storage_key(organization))
    if not organization.logo_filename or content is None:
        raise HTTPException(status_code=404, detail="Organization logo not found")
    return Response(
        content=content,
        media_type=organization.logo_content_type,
        headers={"Content-Disposition": f'inline; filename="{organization.logo_filename}"'},
    )


@router.get("/members", response_model=list[OrganizationMemberRead])
def list_members(
    organization: Organization = Depends(require_organization_role("owner", "admin")),
    db: Session = Depends(get_db),
):
    return organization_service.list_members(db, organization.id)


@router.delete("/members/{user_id}", status_code=204)
def remove_member(
    user_id: str,
    organization: Organization = Depends(require_organization_role("owner", "admin")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    organization_service.remove_member(db, organization, user, user_id)


@router.get("/invitations", response_model=list[OrganizationInvitationRead])
def list_invitations(
    organization: Organization = Depends(require_organization_role("owner", "admin")),
    db: Session = Depends(get_db),
):
    return organization_service.list_invitations(db, organization.id)


@router.post("/invitations", response_model=OrganizationInvitationRead, status_code=201)
def create_invitation(
    body: OrganizationInviteCreate,
    organization: Organization = Depends(require_organization_role("owner", "admin")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return organization_service.invite(db, organization, user, str(body.email), body.role)


@router.post("/invitations/{invitation_id}/resend", response_model=OrganizationInvitationRead)
def resend_invitation(
    invitation_id: str,
    organization: Organization = Depends(require_organization_role("owner", "admin")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return organization_service.resend_invitation(db, organization, user, invitation_id)


@router.post("/invitations/{invitation_id}/revoke", status_code=204)
def revoke_invitation(
    invitation_id: str,
    organization: Organization = Depends(require_organization_role("owner", "admin")),
    db: Session = Depends(get_db),
):
    organization_service.revoke_invitation(db, organization, invitation_id)


@router.post("/invitations/accept")
def accept_invitation(
    token: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member = organization_service.accept_invitation(db, user, token)
    organization = db.get(Organization, member.organization_id)
    return {"organization": _read(organization), "membership_role": member.role}
