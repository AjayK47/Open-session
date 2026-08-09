from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, UTCDateTime
from app.core.security import new_id

if TYPE_CHECKING:
    from app.models.program import Event, Person

TASK_TYPES = ("confirmation", "profile", "file_upload", "custom", "form")
# Task assignment state machine (§20): open → completed (overdue is derived)
TASK_STATUSES = ("open", "completed")


class TaskTemplate(TimestampMixin, Base):
    __tablename__ = "task_templates"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    instructions: Mapped[str | None] = mapped_column(Text)
    task_type: Mapped[str] = mapped_column(String(32), default="custom", nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    due_rule_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    applies_when_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    target_type: Mapped[str] = mapped_column(String(16), default="contact", nullable=False)
    portal_form_id: Mapped[str | None] = mapped_column(String(32))

    event: Mapped["Event"] = relationship()
    assignments: Mapped[list["TaskAssignment"]] = relationship(back_populates="template")


class TaskAssignment(TimestampMixin, Base):
    __tablename__ = "task_assignments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    template_id: Mapped[str] = mapped_column(ForeignKey("task_templates.id"), index=True, nullable=False)
    person_id: Mapped[str] = mapped_column(ForeignKey("people.id"), index=True, nullable=False)
    session_id: Mapped[str | None] = mapped_column(String(32))
    submission_id: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default="open", nullable=False)
    due_at: Mapped[datetime | None] = mapped_column(UTCDateTime, index=True)
    completion_data_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    template: Mapped[TaskTemplate] = relationship(back_populates="assignments")
    person: Mapped["Person"] = relationship()
