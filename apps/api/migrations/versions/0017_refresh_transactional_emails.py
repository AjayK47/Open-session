"""Refresh the built-in transactional email copy and plain-text fallbacks.

Revision ID: 0017_refresh_transactional_emails
Revises: 0016_composio_calendar

The application shell styles every outgoing message at send time. This one-time
refresh also brings templates already stored for existing events up to the new
copy, status summaries, and plain-text equivalents.
"""

import sqlalchemy as sa
from alembic import op

from app.services.communication_service import DEFAULT_TEMPLATES

revision = "0017_refresh_transactional_emails"
down_revision = "0016_composio_calendar"
branch_labels = None
depends_on = None


def upgrade() -> None:
    templates = sa.table(
        "email_templates",
        sa.column("type", sa.String),
        sa.column("name", sa.String),
        sa.column("subject_template", sa.String),
        sa.column("html_template", sa.Text),
        sa.column("text_template", sa.Text),
    )
    for template_type, (name, subject, html, text) in DEFAULT_TEMPLATES.items():
        op.execute(
            templates.update()
            .where(templates.c.type == template_type)
            .values(name=name, subject_template=subject, html_template=html, text_template=text)
        )


def downgrade() -> None:
    # Email copy is content rather than schema. Keep the refreshed templates if
    # the surrounding release is rolled back.
    pass
