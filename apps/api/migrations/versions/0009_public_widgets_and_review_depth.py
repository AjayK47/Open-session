"""Public widget gating, file versioning, and reviewer/plan depth.

Covers everything added for the public widget surfaces (agenda publishing plus
per-session content approval) and the review/content work alongside it: file
versions and comments, evaluation windows, reviewer recusal, per-event custom
fields, and the submission↔track join table.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0009_public_widgets_and_review_depth"
down_revision = "0008_b9_file_requests"
branch_labels = None
depends_on = None

# (table, column, type, server_default) — server defaults are needed because the
# models declare these NOT NULL and existing rows have to be backfilled in place.
NEW_COLUMNS = [
    ("events", "agenda_published_at", sa.DateTime(), None),
    ("sessions", "approval_status", sa.String(16), "pending"),
    ("evaluation_plans", "opens_at", sa.DateTime(), None),
    ("evaluation_plans", "closes_at", sa.DateTime(), None),
    ("review_assignments", "recused_at", sa.DateTime(), None),
    ("review_assignments", "recusal_reason", sa.Text(), None),
    ("event_people", "custom_fields_json", sa.JSON(), "{}"),
    ("files", "uploaded_by_person_id", sa.String(32), None),
    ("files", "version", sa.Integer(), "1"),
    ("files", "is_latest", sa.Boolean(), sa.text("1")),
    ("files", "replaces_file_id", sa.String(32), None),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    for table, column, type_, default in NEW_COLUMNS:
        if table not in inspector.get_table_names():
            continue
        if column in {item["name"] for item in inspector.get_columns(table)}:
            continue
        op.add_column(
            table,
            sa.Column(column, type_, nullable=default is None, server_default=default),
        )

    from app.models.cfp import SubmissionTrack
    from app.models.files import FileComment
    from app.models.schedule import SessionRevision

    for model in (SessionRevision, FileComment, SubmissionTrack):
        model.__table__.create(bind=bind, checkfirst=True)

    # Sessions that predate content approval were already live to organizers; the
    # public surfaces stay closed until the agenda is published, so leaving them
    # "pending" is the safe default and `publish_agenda` promotes them.


def downgrade() -> None:
    pass
