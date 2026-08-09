"""Add per-event human-readable submission reference codes."""

from collections import defaultdict

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0003_b2_reference_codes"
down_revision = "0002_b1_domain_fields"
branch_labels = None
depends_on = None


def _add(table: str, name: str, column) -> None:
    if name not in {item["name"] for item in inspect(op.get_bind()).get_columns(table)}:
        op.add_column(table, column)


def upgrade() -> None:
    _add(
        "events",
        "submission_counter",
        sa.Column("submission_counter", sa.Integer(), nullable=False, server_default="0"),
    )
    _add("submissions", "reference_code", sa.Column("reference_code", sa.String(32), nullable=True))
    connection = op.get_bind()
    counters = defaultdict(int)
    rows = connection.execute(
        sa.text("SELECT id, event_id FROM submissions ORDER BY event_id, created_at, id")
    ).fetchall()
    for submission_id, event_id in rows:
        counters[event_id] += 1
        connection.execute(
            sa.text("UPDATE submissions SET reference_code=:code WHERE id=:id"),
            {"code": f"SESS-{counters[event_id]}", "id": submission_id},
        )
    for event_id, counter in counters.items():
        connection.execute(
            sa.text("UPDATE events SET submission_counter=:counter WHERE id=:id"),
            {"counter": counter, "id": event_id},
        )
    indexes = {index["name"] for index in inspect(connection).get_indexes("submissions")}
    constraints = {constraint.get("name") for constraint in inspect(connection).get_unique_constraints("submissions")}
    if (
        "uq_submissions_event_reference_code" not in indexes
        and "uq_submissions_event_reference_code" not in constraints
    ):
        op.create_index(
            "uq_submissions_event_reference_code",
            "submissions",
            ["event_id", "reference_code"],
            unique=True,
        )


def downgrade() -> None:
    pass
