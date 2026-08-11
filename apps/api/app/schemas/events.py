from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.program import EVENT_STATUSES, EVENT_TYPES


class EventCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=2, max_length=80)
    type: str = Field(default="conference")
    website_url: str | None = None
    location: str | None = Field(default=None, max_length=200)
    timezone: str = Field(min_length=1, max_length=64)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    description: str | None = Field(default=None, max_length=5000)
    email_sender_name: str | None = Field(default=None, max_length=200)
    email_sender_address: EmailStr | None = None
    reply_to: EmailStr | None = None


class ProgramSeedTrack(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    color: str | None = None


class ProgramSeedRoom(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    location: str | None = None
    capacity: int | None = Field(default=None, gt=0)


class ProgramSeedFormat(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    default_duration_minutes: int | None = Field(default=None, gt=0)


class ProgramSeedTag(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class ProgramSeed(BaseModel):
    tracks: list[ProgramSeedTrack] = []
    rooms: list[ProgramSeedRoom] = []
    formats: list[ProgramSeedFormat] = []
    tags: list[ProgramSeedTag] = []


class EventCreateRequest(EventCreate):
    program: ProgramSeed | None = None


class EventUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    type: str | None = None
    website_url: str | None = None
    location: str | None = None
    timezone: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    description: str | None = None
    email_sender_name: str | None = None
    email_sender_address: EmailStr | None = None
    reply_to: EmailStr | None = None
    logo_file_id: str | None = None
    banner_file_id: str | None = None


class EventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    name: str
    slug: str
    type: str
    website_url: str | None
    location: str | None
    timezone: str
    starts_at: datetime | None
    ends_at: datetime | None
    description: str | None
    logo_file_id: str | None
    banner_file_id: str | None
    status: str
    email_sender_name: str | None
    email_sender_address: str | None
    reply_to: str | None
    agenda_published_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PublicEventSummary(BaseModel):
    """Minimal event identity resolvable from a slug with no auth (speaker portal
    and public agenda pages need to turn :eventSlug into an id; nothing sensitive)."""

    id: str
    name: str
    slug: str
    description: str | None
    location: str | None
    timezone: str
    starts_at: datetime | None
    ends_at: datetime | None
    # Relative URLs to the two public-serving endpoints below, already resolved
    # (None when the organizer never uploaded one) — the frontend just renders
    # them, it never sees logo_file_id/banner_file_id.
    logo_url: str | None = None
    banner_url: str | None = None


EVENT_TYPE_CHOICES = list(EVENT_TYPES)
EVENT_STATUS_CHOICES = list(EVENT_STATUSES)
