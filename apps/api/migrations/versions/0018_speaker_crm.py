"""Speaker CRM: org-wide tags on Person, and a cross-event notes table.

Revision ID: 0018_speaker_crm
Revises: 0017_refresh_transactional_emails

Adds the two pieces of storage the org-level speaker directory needs that
didn't already exist: tags_json on people (CRM-04) and a person_notes table
(CRM-03). Everything else the directory needs — the Person identity itself,
and per-event participation via event_people — was already there; Person was
built as a global entity from the start (unique by email, no event_id column).
"""

import sqlalchemy as sa
from alembic import op

revision = "0018_speaker_crm"
down_revision = "0017_refresh_transactional_emails"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "people",
        sa.Column("tags_json", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.create_table(
        "person_notes",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("person_id", sa.String(length=32), sa.ForeignKey("people.id"), nullable=False, index=True),
        sa.Column("author_user_id", sa.String(length=32), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("author_name", sa.String(length=200), nullable=False),
        sa.Column("body", sa.String(length=4000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("person_notes")
    op.drop_column("people", "tags_json")
