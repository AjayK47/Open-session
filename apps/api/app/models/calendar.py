from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, UTCDateTime
from app.core.security import new_id


class CalendarConnection(TimestampMixin, Base):
    __tablename__ = "calendar_connections"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    composio_connected_account_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    provider_account_email: Mapped[str | None] = mapped_column(String(254))
    status: Mapped[str] = mapped_column(String(16), default="active", nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text)
    last_synced_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    __table_args__ = (UniqueConstraint("user_id", "provider", name="uq_calendar_connection_user_provider"),)


class CalendarEventLink(TimestampMixin, Base):
    __tablename__ = "calendar_event_links"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    connection_id: Mapped[str] = mapped_column(ForeignKey("calendar_connections.id"), index=True, nullable=False)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True, nullable=False)
    speaker_person_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    provider_event_id: Mapped[str | None] = mapped_column(String(512))
    provider_version: Mapped[str | None] = mapped_column(String(512))
    sync_status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text)
    last_synced_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    __table_args__ = (UniqueConstraint("connection_id", "session_id", name="uq_calendar_event_connection_session"),)
