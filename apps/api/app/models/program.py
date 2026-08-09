from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, UTCDateTime
from app.core.security import new_id

if TYPE_CHECKING:
    from app.models.cfp import SubmissionForm
    from app.models.schedule import ProgramSession

EVENT_STATUSES = ("draft", "active", "archived")
EVENT_TYPES = ("conference", "summit", "meetup", "other")


class Event(TimestampMixin, Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    type: Mapped[str] = mapped_column(String(32), default="conference", nullable=False)
    website_url: Mapped[str | None] = mapped_column(String(500))
    location: Mapped[str | None] = mapped_column(String(200))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)
    # Set by the agenda "Publish" action. Null means the public agenda widget
    # shows a "not published yet" state rather than a half-built schedule.
    agenda_published_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    starts_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    ends_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    description: Mapped[str | None] = mapped_column(Text)
    logo_file_id: Mapped[str | None] = mapped_column(String(32))
    banner_file_id: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default="draft", nullable=False)
    email_sender_name: Mapped[str | None] = mapped_column(String(200))
    email_sender_address: Mapped[str | None] = mapped_column(String(254))
    reply_to: Mapped[str | None] = mapped_column(String(254))
    submission_counter: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    tracks: Mapped[list["Track"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    rooms: Mapped[list["Room"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    formats: Mapped[list["SessionFormat"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    tags: Mapped[list["Tag"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    submission_forms: Mapped[list["SubmissionForm"]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )
    sessions: Mapped[list["ProgramSession"]] = relationship(back_populates="event", cascade="all, delete-orphan")


class Track(TimestampMixin, Base):
    __tablename__ = "tracks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str | None] = mapped_column(String(50))
    serial_schedule: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    event: Mapped[Event] = relationship(back_populates="tracks")


class Room(TimestampMixin, Base):
    __tablename__ = "rooms"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    location: Mapped[str | None] = mapped_column(String(200))
    capacity: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)

    event: Mapped[Event] = relationship(back_populates="rooms")


class SessionFormat(TimestampMixin, Base):
    __tablename__ = "session_formats"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    default_duration_minutes: Mapped[int | None] = mapped_column(Integer)

    event: Mapped[Event] = relationship(back_populates="formats")


class Tag(TimestampMixin, Base):
    __tablename__ = "tags"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)

    event: Mapped[Event] = relationship(back_populates="tags")


class Person(TimestampMixin, Base):
    __tablename__ = "people"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    primary_email: Mapped[str] = mapped_column(String(254), nullable=False, unique=True, index=True)
    first_name: Mapped[str | None] = mapped_column(String(120))
    last_name: Mapped[str | None] = mapped_column(String(120))
    bio: Mapped[str | None] = mapped_column(Text)
    company: Mapped[str | None] = mapped_column(String(200))
    job_title: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(60))
    headshot_file_id: Mapped[str | None] = mapped_column(String(32))
    website: Mapped[str | None] = mapped_column(String(500))
    linkedin_url: Mapped[str | None] = mapped_column(String(500))
    x_url: Mapped[str | None] = mapped_column(String(500))
