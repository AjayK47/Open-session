"""Create all current tables without altering existing tables."""

from alembic import op

import app.models  # noqa: F401
from app.core.db import Base

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    pass
