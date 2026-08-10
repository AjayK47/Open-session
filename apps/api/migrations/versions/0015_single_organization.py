"""Add the local single-organization workspace and invitation lifecycle.

Revision ID: 0015_single_organization
Revises: 0014_portal_resources
"""

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision = "0015_single_organization"
down_revision = "0014_portal_resources"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.models.organization import Organization, OrganizationInvitation, OrganizationMembership

    bind = op.get_bind()
    Organization.__table__.create(bind=bind, checkfirst=True)
    OrganizationMembership.__table__.create(bind=bind, checkfirst=True)
    OrganizationInvitation.__table__.create(bind=bind, checkfirst=True)

    # Existing development/evaluation databases used the literal org_default.
    # Adopt those events into a real workspace and preserve organizer access.
    event_count = bind.scalar(sa.text("SELECT count(*) FROM events")) or 0
    organization_count = bind.scalar(sa.text("SELECT count(*) FROM organizations")) or 0
    if event_count and not organization_count:
        owner_id = bind.scalar(
            sa.text("SELECT user_id FROM role_bindings WHERE role = 'owner' ORDER BY created_at LIMIT 1")
        ) or bind.scalar(sa.text("SELECT id FROM users ORDER BY created_at LIMIT 1"))
        if owner_id:
            organization_id = "organization"
            timestamp = datetime.now(UTC)
            bind.execute(
                sa.text(
                    "INSERT INTO organizations "
                    "(id, name, slug, default_timezone, created_by, created_at, updated_at) "
                    "VALUES (:id, :name, :slug, :timezone, :owner, :created, :updated)"
                ),
                {
                    "id": organization_id,
                    "name": "Open Session Workspace",
                    "slug": "workspace",
                    "timezone": "UTC",
                    "owner": owner_id,
                    "created": timestamp,
                    "updated": timestamp,
                },
            )
            bind.execute(sa.text("UPDATE events SET organization_id = :id"), {"id": organization_id})
            organizer_rows = bind.execute(
                sa.text(
                    "SELECT user_id, "
                    "CASE WHEN max(CASE WHEN role = 'owner' THEN 1 ELSE 0 END) = 1 THEN 'owner' ELSE 'admin' END role "
                    "FROM role_bindings WHERE role IN ('owner', 'admin') GROUP BY user_id"
                )
            ).all()
            for user_id, role in organizer_rows:
                bind.execute(
                    sa.text(
                        "INSERT INTO organization_memberships "
                        "(id, organization_id, user_id, role, status, created_at, updated_at) "
                        "VALUES (:id, :organization_id, :user_id, :role, 'active', :created, :updated)"
                    ),
                    {
                        "id": uuid.uuid4().hex,
                        "organization_id": organization_id,
                        "user_id": user_id,
                        "role": role,
                        "created": timestamp,
                        "updated": timestamp,
                    },
                )

    with op.batch_alter_table("login_tokens") as batch:
        batch.alter_column("code", existing_type=sa.String(length=8), type_=sa.String(length=64), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("login_tokens") as batch:
        batch.alter_column("code", existing_type=sa.String(length=64), type_=sa.String(length=8), nullable=False)
    op.drop_table("organization_invitations")
    op.drop_table("organization_memberships")
    op.drop_table("organizations")
