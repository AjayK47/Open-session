from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(pattern=r"^[a-z0-9-]+$", min_length=2, max_length=80)
    website_url: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=2000)
    default_timezone: str = Field(default="UTC", min_length=1, max_length=64)

    @field_validator("name", "slug")
    @classmethod
    def strip_required(cls, value: str) -> str:
        return value.strip()


class OrganizationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9-]+$", min_length=2, max_length=80)
    website_url: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=2000)
    default_timezone: str | None = Field(default=None, min_length=1, max_length=64)


class OrganizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    website_url: str | None
    description: str | None
    default_timezone: str
    logo_url: str | None = None
    created_at: datetime
    updated_at: datetime


class OrganizationContext(BaseModel):
    organization: OrganizationRead | None
    membership_role: str | None
    needs_onboarding: bool
    pending_invitation_count: int = 0


class OrganizationInviteCreate(BaseModel):
    email: EmailStr
    role: str = "admin"

    @field_validator("role")
    @classmethod
    def valid_role(cls, value: str) -> str:
        if value not in {"admin", "member"}:
            raise ValueError("Role must be admin or member")
        return value


class OrganizationInvitationRead(BaseModel):
    id: str
    email: str
    role: str
    status: str
    expires_at: datetime
    created_at: datetime
    invite_url: str | None = None


class OrganizationMemberRead(BaseModel):
    user_id: str
    email: str
    role: str
    status: str
    created_at: datetime
