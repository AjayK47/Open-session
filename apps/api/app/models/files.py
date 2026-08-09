from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UTCDateTime, utcnow
from app.core.security import new_id

if TYPE_CHECKING:
    pass

FILE_TYPES = ("headshot", "slides", "supporting", "submission")


class File(Base):
    __tablename__ = "files"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    file_type: Mapped[str] = mapped_column(String(32), nullable=False)
    person_id: Mapped[str | None] = mapped_column(ForeignKey("people.id"), index=True)
    submission_id: Mapped[str | None] = mapped_column(String(32), index=True)
    session_id: Mapped[str | None] = mapped_column(String(32), index=True)
    task_assignment_id: Mapped[str | None] = mapped_column(String(32))
    file_request_id: Mapped[str | None] = mapped_column(String(32), index=True)
    uploaded_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)
    uploaded_by_person_id: Mapped[str | None] = mapped_column(String(32))
    # Versioning (CNT-04). Re-uploading a deliverable does not overwrite: it adds
    # a row whose `replaces_file_id` points at the previous one and flips that
    # row's `is_latest` off, so old versions stay downloadable.
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_latest: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    replaces_file_id: Mapped[str | None] = mapped_column(String(32), index=True)


class FileComment(Base):
    """A note on a deliverable, readable by organizer and speaker alike (CNT-05)."""

    __tablename__ = "file_comments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    file_id: Mapped[str] = mapped_column(ForeignKey("files.id"), index=True, nullable=False)
    author_person_id: Mapped[str | None] = mapped_column(String(32))
    author_name: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)


# Public name used by the backend plan while preserving existing imports.
FileRecord = File
