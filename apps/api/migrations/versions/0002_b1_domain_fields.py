"""Add typed submission and session domain fields."""

from alembic import op
from sqlalchemy import Column, DateTime, Float, Integer, String, inspect

revision = "0002_b1_domain_fields"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def _add(table: str, name: str, column) -> None:
    if name not in {item["name"] for item in inspect(op.get_bind()).get_columns(table)}:
        op.add_column(table, column)


def upgrade() -> None:
    for name, column in [
        ("capacity", Integer()),
        ("ceu_credits", Float()),
        ("client_session_id", String(128)),
        ("starts_at", DateTime(timezone=True)),
        ("ends_at", DateTime(timezone=True)),
        ("language", String(64)),
    ]:
        _add("submissions", name, Column(name, column))
    for name, column in [
        ("capacity", Integer()),
        ("ceu_credits", Float()),
        ("chairperson", String(200)),
        ("language", String(64)),
        ("location", String(200)),
    ]:
        _add("sessions", name, Column(name, column))


def downgrade() -> None:
    pass
