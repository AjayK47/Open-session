"""Add assignment and upload constraints to file requests.

Revision ID: 0012_file_request_assignments
Revises: 0011_calendar_oauth
"""

import sqlalchemy as sa
from alembic import op

revision = "0012_file_request_assignments"
down_revision = "0011_calendar_oauth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing = {column["name"] for column in inspector.get_columns("file_requests")}
    indexes = {index["name"] for index in inspector.get_indexes("file_requests")}
    with op.batch_alter_table("file_requests") as batch:
        if "due_at" not in existing:
            batch.add_column(sa.Column("due_at", sa.DateTime(timezone=True), nullable=True))
        if "session_id" not in existing:
            batch.add_column(sa.Column("session_id", sa.String(length=32), nullable=True))
        if "assigned_person_ids_json" not in existing:
            batch.add_column(sa.Column("assigned_person_ids_json", sa.JSON(), nullable=False, server_default="[]"))
        if "accepted_extensions_json" not in existing:
            batch.add_column(sa.Column("accepted_extensions_json", sa.JSON(), nullable=False, server_default="[]"))
        if "max_size_mb" not in existing:
            batch.add_column(sa.Column("max_size_mb", sa.Integer(), nullable=False, server_default="50"))
        if "ix_file_requests_session_id" not in indexes:
            batch.create_index("ix_file_requests_session_id", ["session_id"])


def downgrade() -> None:
    with op.batch_alter_table("file_requests") as batch:
        batch.drop_index("ix_file_requests_session_id")
        batch.drop_column("max_size_mb")
        batch.drop_column("accepted_extensions_json")
        batch.drop_column("assigned_person_ids_json")
        batch.drop_column("session_id")
        batch.drop_column("due_at")
