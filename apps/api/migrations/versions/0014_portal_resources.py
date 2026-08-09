"""Add portal_resources table (speaker-portal wiki/reference pages, docx §8).

Revision ID: 0014_portal_resources
Revises: 0013_idempotency_constraints
"""

from alembic import op

revision = "0014_portal_resources"
down_revision = "0013_idempotency_constraints"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.models.portal import PortalResource

    bind = op.get_bind()
    PortalResource.__table__.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    pass
