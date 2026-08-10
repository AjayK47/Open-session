"""Add speaker-owned Google and Microsoft calendar synchronization."""

from alembic import op

revision = "0011_calendar_oauth"
down_revision = "0010_ai_reviews"
branch_labels = None
depends_on = None


def upgrade() -> None:
    import sqlalchemy as sa

    from app.models.calendar import CalendarConnection, CalendarEventLink

    bind = op.get_bind()
    for model in (CalendarConnection, CalendarEventLink):
        model.__table__.create(bind=bind, checkfirst=True)
    # Kept explicit because the current application no longer maps this legacy
    # direct-OAuth table; migration 0016 removes it during the Composio cutover.
    if not sa.inspect(bind).has_table("calendar_oauth_states"):
        op.create_table(
            "calendar_oauth_states",
            sa.Column("state", sa.String(length=128), primary_key=True),
            sa.Column("user_id", sa.String(length=32), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("provider", sa.String(length=16), nullable=False),
            sa.Column("code_verifier", sa.String(length=128), nullable=False),
            sa.Column("return_path", sa.String(length=500), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("consumed_at", sa.DateTime(timezone=True)),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_calendar_oauth_states_user_id", "calendar_oauth_states", ["user_id"])


def downgrade() -> None:
    op.drop_table("calendar_oauth_states")
    op.drop_table("calendar_event_links")
    op.drop_table("calendar_connections")
