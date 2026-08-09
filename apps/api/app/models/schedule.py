from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, UTCDateTime, utcnow
from app.core.security import new_id

if TYPE_CHECKING:
    from app.models.program import Event, Person

# Session state machine (§20): draft → confirmed → scheduled → published → cancelled
SESSION_STATUSES = ("draft", "confirmed", "scheduled", "published", "cancelled")


class ProgramSession(TimestampMixin, Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    source_submission_id: Mapped[str | None] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="draft", nullable=False)
    # Content review, independent of scheduling status: only approved sessions
    # reach the public widgets (CNT-12). Defaults to pending so nothing is
    # published by accident.
    approval_status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    track_id: Mapped[str | None] = mapped_column(String(32))
    format_id: Mapped[str | None] = mapped_column(String(32))
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    room_id: Mapped[str | None] = mapped_column(String(32), index=True)
    starts_at: Mapped[datetime | None] = mapped_column(UTCDateTime, index=True)
    ends_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    calendar_uid: Mapped[str | None] = mapped_column(String(64), unique=True)
    calendar_sequence: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    capacity: Mapped[int | None] = mapped_column(Integer)
    ceu_credits: Mapped[float | None] = mapped_column(Float)
    chairperson: Mapped[str | None] = mapped_column(String(200))
    language: Mapped[str | None] = mapped_column(String(64))
    location: Mapped[str | None] = mapped_column(String(200))

    event: Mapped["Event"] = relationship(back_populates="sessions")
    participants: Mapped[list["SessionParticipant"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("source_submission_id", name="uq_sessions_source_submission"),
    )


class SessionRevision(Base):
    """A snapshot of a session's editable content before a change (CNT-11).

    Stored as the *previous* values, so restoring is just applying the snapshot
    back. Attribution and timestamp come along so the history reads as "who
    changed what, when" rather than an anonymous diff.
    """

    __tablename__ = "session_revisions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True, nullable=False)
    editor_person_id: Mapped[str | None] = mapped_column(String(32))
    editor_name: Mapped[str] = mapped_column(String(200), nullable=False)
    changed_fields_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    snapshot_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)


class SessionParticipant(TimestampMixin, Base):
    __tablename__ = "session_participants"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True, nullable=False)
    person_id: Mapped[str] = mapped_column(ForeignKey("people.id"), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(64), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    session: Mapped[ProgramSession] = relationship(back_populates="participants")
    person: Mapped["Person"] = relationship()
