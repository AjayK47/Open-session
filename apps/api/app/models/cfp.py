from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, UTCDateTime, utcnow
from app.core.security import new_id

if TYPE_CHECKING:
    from app.models.program import Event, Person

SUBMISSION_FORM_TYPES = ("abstract", "session")
SUBMISSION_FORM_STATUSES = ("draft", "open", "closed")

# Submission state machine (§20): draft → submitted → pending_review →
# accept_queue | decline_queue → accepted | declined → withdrawn
SUBMISSION_STATUSES = (
    "draft",
    "submitted",
    "pending_review",
    "accept_queue",
    "decline_queue",
    "accepted",
    "declined",
    "withdrawn",
)


class SubmissionForm(TimestampMixin, Base):
    __tablename__ = "submission_forms"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    internal_name: Mapped[str] = mapped_column(String(200), nullable=False)
    public_title: Mapped[str] = mapped_column(String(300), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    submission_type: Mapped[str] = mapped_column(String(16), default="abstract", nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="draft", nullable=False)
    open_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    close_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    submission_limit: Mapped[int | None] = mapped_column(Integer)
    allow_multiple: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_drafts: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    participant_roles_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    sections_fields_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    conditional_rules_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    routing_rules_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    success_message_html: Mapped[str | None] = mapped_column(Text)
    auto_redirect_portal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    confirmation_template_id: Mapped[str | None] = mapped_column(String(32))
    admin_notification_config_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    edit_locked_after: Mapped[datetime | None] = mapped_column(UTCDateTime)

    event: Mapped["Event"] = relationship(back_populates="submission_forms")
    submissions: Mapped[list["Submission"]] = relationship(back_populates="form", cascade="all, delete-orphan")


class Submission(TimestampMixin, Base):
    __tablename__ = "submissions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    form_id: Mapped[str | None] = mapped_column(ForeignKey("submission_forms.id"), index=True)
    submitter_person_id: Mapped[str | None] = mapped_column(ForeignKey("people.id"))
    status: Mapped[str] = mapped_column(String(16), default="draft", nullable=False)
    title: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    track_id: Mapped[str | None] = mapped_column(String(32))
    format_id: Mapped[str | None] = mapped_column(String(32))
    level: Mapped[str | None] = mapped_column(String(64))
    custom_answers_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    tags_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    owner_person_id: Mapped[str | None] = mapped_column(String(32))
    planned_evaluation_plan_id: Mapped[str | None] = mapped_column(String(32))
    reference_code: Mapped[str | None] = mapped_column(String(32), index=True)
    capacity: Mapped[int | None] = mapped_column(Integer)
    ceu_credits: Mapped[float | None] = mapped_column(Float)
    client_session_id: Mapped[str | None] = mapped_column(String(128))
    starts_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    ends_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    language: Mapped[str | None] = mapped_column(String(64))
    aggregate_rating: Mapped[float | None] = mapped_column(Float)
    notified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    form: Mapped[SubmissionForm] = relationship(back_populates="submissions")
    participants: Mapped[list["SubmissionParticipant"]] = relationship(
        back_populates="submission", cascade="all, delete-orphan"
    )

    __table_args__ = (UniqueConstraint("event_id", "reference_code", name="uq_submissions_event_reference_code"),)


class SubmissionParticipant(TimestampMixin, Base):
    __tablename__ = "submission_participants"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    submission_id: Mapped[str] = mapped_column(ForeignKey("submissions.id"), index=True, nullable=False)
    person_id: Mapped[str] = mapped_column(ForeignKey("people.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(64), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    submission: Mapped[Submission] = relationship(back_populates="participants")
    person: Mapped["Person"] = relationship()


class SubmissionTrack(TimestampMixin, Base):
    """Additional tracks a submission was sent to.

    `Submission.track_id` stays the *primary* track — every existing read path,
    export, and agenda view keys off it — and this table carries the rest. A talk
    submitted to a single track has no rows here at all, so the common case is
    unchanged and nothing has to be backfilled.
    """

    __tablename__ = "submission_tracks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    submission_id: Mapped[str] = mapped_column(ForeignKey("submissions.id"), index=True, nullable=False)
    track_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    submission: Mapped[Submission] = relationship()


class SubmissionEvent(Base):
    """Small immutable audit trail for submission changes."""

    __tablename__ = "submission_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    submission_id: Mapped[str] = mapped_column(ForeignKey("submissions.id"), index=True, nullable=False)
    actor_user_id: Mapped[str | None] = mapped_column(String(32), index=True)
    actor_person_id: Mapped[str | None] = mapped_column(String(32), index=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    changed_fields_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)
