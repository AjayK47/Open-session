"""Scope Person to its organization; add the active-org pointer on users.

Revision ID: 0019_multi_org
Revises: 0018_speaker_crm

Person was a global, deployment-wide entity (unique by email alone — see
0018's note). Multi-org mode (OPEN_SESSION_MULTI_ORG_ENABLED) needs each
organization to have its own contact directory, so Person gains
organization_id and the uniqueness moves to (organization_id, primary_email).

Every existing install has at most one organization today, so the backfill
is exact, not a guess: every current person belongs to whichever org exists.
A fresh install (no orgs, no people yet) is a no-op beyond the column adds.

users.active_organization_id is added here too — it's unused (always NULL)
until multi_org_enabled is turned on; see organization_service.resolve_active.
"""

import sqlalchemy as sa
from alembic import op

revision = "0019_multi_org"
down_revision = "0018_speaker_crm"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("active_organization_id", sa.String(length=32), nullable=True))
    op.add_column("people", sa.Column("organization_id", sa.String(length=32), nullable=True))

    bind = op.get_bind()
    organization_id = bind.scalar(sa.text("SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1"))
    if organization_id:
        bind.execute(
            sa.text("UPDATE people SET organization_id = :id WHERE organization_id IS NULL"),
            {"id": organization_id},
        )

    existing_index_names = {ix["name"] for ix in sa.inspect(bind).get_indexes("people")}
    with op.batch_alter_table("people", recreate="always") as batch:
        if "ix_people_primary_email" in existing_index_names:
            batch.drop_index("ix_people_primary_email")
        batch.alter_column("organization_id", existing_type=sa.String(length=32), nullable=False)
        batch.create_index("ix_people_organization_id", ["organization_id"])
        batch.create_index("ix_people_primary_email", ["primary_email"])
        batch.create_unique_constraint("uq_people_org_email", ["organization_id", "primary_email"])
        batch.create_foreign_key(
            "fk_people_organization_id_organizations", "organizations", ["organization_id"], ["id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("people", recreate="always") as batch:
        batch.drop_constraint("fk_people_organization_id_organizations", type_="foreignkey")
        batch.drop_constraint("uq_people_org_email", type_="unique")
        batch.drop_index("ix_people_organization_id")
        batch.drop_index("ix_people_primary_email")
        batch.drop_column("organization_id")
        batch.create_index("ix_people_primary_email", ["primary_email"], unique=True)
    op.drop_column("users", "active_organization_id")
