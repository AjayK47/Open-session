"""Add file request tables and file association."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0008_b9_file_requests"
down_revision = "0007_b8_portal_forms"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "file_request_id" not in {item["name"] for item in inspect(op.get_bind()).get_columns("files")}:
        op.add_column("files", sa.Column("file_request_id", sa.String(32), nullable=True))
    from app.models.portal import FileRequest, FileRequestUpload

    bind = op.get_bind()
    FileRequest.__table__.create(bind=bind, checkfirst=True)
    FileRequestUpload.__table__.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    pass
