"""Ensure portal form and field library tables exist."""

from alembic import op

revision = "0007_b8_portal_forms"
down_revision = "0006_b7_task_targeting"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.models.portal import FieldDefinition, PortalForm

    bind = op.get_bind()
    FieldDefinition.__table__.create(bind=bind, checkfirst=True)
    PortalForm.__table__.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    pass
