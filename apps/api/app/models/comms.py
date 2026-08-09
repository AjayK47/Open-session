from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, UTCDateTime
from app.core.security import new_id

if TYPE_CHECKING:
    from app.models.program import Event

COMM_STATUSES = ("queued", "sending", "sent", "failed")

AUTOMATION_TRIGGERS = (
    "submission_received",
    "submission_accepted",
    "submission_declined",
    "task_assigned",
    "task_due_soon",
    "task_overdue",
    "session_scheduled",
    "session_schedule_changed",
)


class EmailTemplate(TimestampMixin, Base):
    __tablename__ = "email_templates"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    subject_template: Mapped[str] = mapped_column(String(500), nullable=False)
    html_template: Mapped[str] = mapped_column(Text, nullable=False)
    text_template: Mapped[str | None] = mapped_column(Text)

    event: Mapped["Event"] = relationship()


class CommunicationAutomation(TimestampMixin, Base):
    __tablename__ = "communication_automations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(64), nullable=False)
    conditions_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    template_id: Mapped[str | None] = mapped_column(String(32))
    include_calendar_invite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    event: Mapped["Event"] = relationship()


class Communication(TimestampMixin, Base):
    __tablename__ = "communications"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    recipient_person_id: Mapped[str | None] = mapped_column(String(32), index=True)
    recipient_email: Mapped[str] = mapped_column(String(254), nullable=False)
    template_id: Mapped[str | None] = mapped_column(String(32))
    related_submission_id: Mapped[str | None] = mapped_column(String(32), index=True)
    related_session_id: Mapped[str | None] = mapped_column(String(32), index=True)
    related_task_assignment_id: Mapped[str | None] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(16), default="queued", nullable=False)
    provider_message_id: Mapped[str | None] = mapped_column(String(255))
    error_message: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
