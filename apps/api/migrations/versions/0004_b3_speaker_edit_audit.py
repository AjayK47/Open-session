"""Add accepted-speaker edit lock and submission audit table."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0004_b3_speaker_edit_audit"
down_revision = "0003_b2_reference_codes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "edit_locked_after" not in {item["name"] for item in inspect(op.get_bind()).get_columns("submission_forms")}:
        op.add_column("submission_forms", sa.Column("edit_locked_after", sa.DateTime(timezone=True), nullable=True))
    # The baseline creates this on a fresh DB; this covers existing installs.
    from app.models.cfp import SubmissionEvent

    SubmissionEvent.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    pass
