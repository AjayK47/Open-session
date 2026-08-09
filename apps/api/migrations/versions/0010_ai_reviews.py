"""Persist real AI-assisted submission reviews and organizer overrides."""

from alembic import op

revision = "0010_ai_reviews"
down_revision = "0009_public_widgets_and_review_depth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.models.evaluation import AiReviewRun

    AiReviewRun.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    op.drop_table("ai_review_runs")
