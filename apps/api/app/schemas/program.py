from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TrackCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    color: str | None = Field(default=None, max_length=50)
    serial_schedule: bool = False
    active: bool = True


class TrackUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    color: str | None = None
    serial_schedule: bool | None = None
    active: bool | None = None


class TrackRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_id: str
    name: str
    description: str | None
    color: str | None
    serial_schedule: bool
    active: bool
    created_at: datetime
    updated_at: datetime


class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    location: str | None = Field(default=None, max_length=200)
    capacity: int | None = Field(default=None, gt=0)
    notes: str | None = None


class RoomUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    location: str | None = None
    capacity: int | None = Field(default=None, gt=0)
    notes: str | None = None


class RoomRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_id: str
    name: str
    location: str | None
    capacity: int | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class SessionFormatCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    default_duration_minutes: int | None = Field(default=None, gt=0)


class SessionFormatUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    default_duration_minutes: int | None = Field(default=None, gt=0)


class SessionFormatRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_id: str
    name: str
    default_duration_minutes: int | None
    created_at: datetime
    updated_at: datetime


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)


class TagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_id: str
    name: str
    created_at: datetime
    updated_at: datetime
