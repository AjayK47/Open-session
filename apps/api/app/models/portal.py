from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, UTCDateTime, utcnow
from app.core.security import new_id

if TYPE_CHECKING:
    from app.models.program import Event


class FieldDefinition(TimestampMixin, Base):
    __tablename__ = "field_definitions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    key: Mapped[str] = mapped_column(String(120), nullable=False)
    label: Mapped[str] = mapped_column(String(300), nullable=False)
    field_type: Mapped[str] = mapped_column(String(32), nullable=False)
    config_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    event: Mapped["Event"] = relationship()


class PortalForm(TimestampMixin, Base):
    __tablename__ = "portal_forms"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    target_type: Mapped[str] = mapped_column(String(16), default="contact", nullable=False)
    sections_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    settings_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="draft", nullable=False)

    event: Mapped["Event"] = relationship()


class FileRequest(TimestampMixin, Base):
    __tablename__ = "file_requests"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    instructions_html: Mapped[str | None] = mapped_column(Text)
    target_type: Mapped[str] = mapped_column(String(16), default="contact", nullable=False)
    due_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    session_id: Mapped[str | None] = mapped_column(String(32), index=True)
    assigned_person_ids_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    accepted_extensions_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    max_size_mb: Mapped[int] = mapped_column(Integer, default=50, nullable=False)

    event: Mapped["Event"] = relationship()
    uploads: Mapped[list["FileRequestUpload"]] = relationship(
        back_populates="file_request", cascade="all, delete-orphan"
    )


class FileRequestUpload(Base):
    __tablename__ = "file_request_uploads"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    file_request_id: Mapped[str] = mapped_column(ForeignKey("file_requests.id"), index=True, nullable=False)
    person_id: Mapped[str] = mapped_column(ForeignKey("people.id"), index=True, nullable=False)
    file_id: Mapped[str] = mapped_column(ForeignKey("files.id"), index=True, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)

    file_request: Mapped["FileRequest"] = relationship(back_populates="uploads")


class PortalResource(TimestampMixin, Base):
    """A wiki-style reference page in the speaker portal (docx §8: "Resource and
    wiki pages within the speaker portal, including HTML embed support").

    Deliberately just a title and an HTML body — organizers paste in reference
    material or embed codes (a Google Doc, a Loom, a Figma board) via the rich
    text editor's HTML source view; nothing here interprets or sandboxes that
    HTML beyond what the editor and the portal's rendering already do for
    session descriptions.
    """

    __tablename__ = "portal_resources"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Draft pages are visible to the organizer only; published ones appear in
    # every accepted speaker's portal for this event.
    status: Mapped[str] = mapped_column(String(16), default="draft", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    event: Mapped["Event"] = relationship()
