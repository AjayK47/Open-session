"""Add speaker-owned Google and Microsoft calendar synchronization."""

from alembic import op

revision = "0011_calendar_oauth"
down_revision = "0010_ai_reviews"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.models.calendar import CalendarConnection, CalendarEventLink, CalendarOAuthState

    bind = op.get_bind()
    for model in (CalendarConnection, CalendarEventLink, CalendarOAuthState):
        model.__table__.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    op.drop_table("calendar_oauth_states")
    op.drop_table("calendar_event_links")
    op.drop_table("calendar_connections")
