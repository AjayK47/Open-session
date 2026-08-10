"""Replace direct calendar OAuth credentials with Composio connected accounts.

Revision ID: 0016_composio_calendar
Revises: 0015_single_organization

Existing direct-OAuth connections cannot be transferred to Composio, so they
are intentionally removed and speakers reconnect through a Composio Connect
Link. Calendar event links are rebuilt on the first synchronization.
"""

import sqlalchemy as sa
from alembic import op

revision = "0016_composio_calendar"
down_revision = "0015_single_organization"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table in ("calendar_event_links", "calendar_connections", "calendar_oauth_states"):
        if inspector.has_table(table):
            op.drop_table(table)

    from app.models.calendar import CalendarConnection, CalendarEventLink

    CalendarConnection.__table__.create(bind=bind)
    CalendarEventLink.__table__.create(bind=bind)


def downgrade() -> None:
    # The cutover deliberately discards non-portable provider refresh tokens.
    # Downgrading removes Composio state rather than recreating unusable legacy
    # connections with missing credentials.
    op.drop_table("calendar_event_links")
    op.drop_table("calendar_connections")
