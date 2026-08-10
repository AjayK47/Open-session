from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, UTCDateTime
from app.core.security import new_id


class Organization(TimestampMixin, Base):
    """The single organizer workspace for this Open Session deployment."""

    __tablename__ = "organizations"

    # A fixed primary key makes the single-workspace rule safe under concurrent
    # first-run requests as well as in the service layer.
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default="organization")
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    website_url: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    default_timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)
    logo_filename: Mapped[str | None] = mapped_column(String(255))
    logo_content_type: Mapped[str | None] = mapped_column(String(128))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)


class OrganizationMembership(TimestampMixin, Base):
    __tablename__ = "organization_memberships"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # owner | admin | member
    status: Mapped[str] = mapped_column(String(16), default="active", nullable=False)

    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_org_membership_user"),)


class OrganizationInvitation(TimestampMixin, Base):
    __tablename__ = "organization_invitations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(254), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    invited_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
