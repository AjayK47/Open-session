from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, UTCDateTime
from app.core.security import new_id

if TYPE_CHECKING:
    from app.models.program import Event


class EvaluationPlan(TimestampMixin, Base):
    __tablename__ = "evaluation_plans"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    instructions: Mapped[str | None] = mapped_column(Text)
    scope_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    criteria_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    reviews_required: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    blind_review: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    round_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # Each round runs to its own window (ABS-01), independent of the CFP's.
    opens_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    closes_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    event: Mapped["Event"] = relationship()
    assignments: Mapped[list["ReviewAssignment"]] = relationship(back_populates="plan", cascade="all, delete-orphan")


class ReviewAssignment(TimestampMixin, Base):
    __tablename__ = "review_assignments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    evaluation_plan_id: Mapped[str] = mapped_column(ForeignKey("evaluation_plans.id"), index=True, nullable=False)
    submission_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    reviewer_person_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), default="assigned", nullable=False
    )  # assigned|in_progress|completed|recused
    # ABS-12: a reviewer who knows the author declares it rather than scoring.
    recused_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    recusal_reason: Mapped[str | None] = mapped_column(Text)
    due_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    assigned_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    plan: Mapped[EvaluationPlan] = relationship(back_populates="assignments")
    review: Mapped[Optional["Review"]] = relationship(
        back_populates="assignment", uselist=False, cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint(
            "evaluation_plan_id",
            "submission_id",
            "reviewer_person_id",
            name="uq_review_assignment_plan_submission_reviewer",
        ),
    )


class Review(TimestampMixin, Base):
    __tablename__ = "reviews"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    assignment_id: Mapped[str] = mapped_column(ForeignKey("review_assignments.id"), index=True, nullable=False)
    scores_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    weighted_score: Mapped[float | None] = mapped_column(Float)
    comments: Mapped[str | None] = mapped_column(Text)
    submitted_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    assignment: Mapped[ReviewAssignment] = relationship(back_populates="review")


class AiReviewRun(TimestampMixin, Base):
    __tablename__ = "ai_review_runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    evaluation_plan_id: Mapped[str] = mapped_column(ForeignKey("evaluation_plans.id"), index=True, nullable=False)
    submission_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(16), default="running", nullable=False)
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    provider_response_id: Mapped[str | None] = mapped_column(String(120))
    prompt_version: Mapped[str] = mapped_column(String(32), nullable=False)
    rubric_version: Mapped[str] = mapped_column(String(64), nullable=False)
    criterion_scores_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    overall_score: Mapped[float | None] = mapped_column(Float)
    rationale: Mapped[str | None] = mapped_column(Text)
    flags_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
    override_score: Mapped[float | None] = mapped_column(Float)
    override_reason: Mapped[str | None] = mapped_column(Text)
    override_by_user_id: Mapped[str | None] = mapped_column(String(32))
    overridden_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    __table_args__ = (
        UniqueConstraint("evaluation_plan_id", "submission_id", "idempotency_key", name="uq_ai_review_idempotency"),
    )
