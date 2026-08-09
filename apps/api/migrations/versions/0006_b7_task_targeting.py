"""Add task targeting and portal-form references."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0006_b7_task_targeting"
down_revision = "0005_b4_b5_exports_bundle"
branch_labels = None
depends_on = None


def _add(name: str, column) -> None:
    if name not in {item["name"] for item in inspect(op.get_bind()).get_columns("task_templates")}:
        op.add_column("task_templates", column)


def upgrade() -> None:
    _add("target_type", sa.Column("target_type", sa.String(16), nullable=False, server_default="contact"))
    _add("portal_form_id", sa.Column("portal_form_id", sa.String(32), nullable=True))


def downgrade() -> None:
    pass
