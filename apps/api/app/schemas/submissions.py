from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ParticipantInput(BaseModel):
    email: EmailStr
    role: str = Field(min_length=1, max_length=64)
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    company: str | None = Field(default=None, max_length=200)
    job_title: str | None = Field(default=None, max_length=200)
    bio: str | None = None


class ParticipantRead(BaseModel):
    id: str
    person_id: str
    role: str
    sort_order: int
    email: EmailStr
    first_name: str | None
    last_name: str | None
    company: str | None
    job_title: str | None
    bio: str | None


class SubmissionWrite(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    description: str | None = None
    format_id: str | None = None
    track_id: str | None = None
    # A talk can be submitted to more than one track. The first entry becomes
    # `track_id` (the primary track); omit to leave existing tracks untouched.
    track_ids: list[str] | None = None
    level: str | None = Field(default=None, max_length=64)
    capacity: int | None = Field(default=None, ge=0)
    ceu_credits: float | None = Field(default=None, ge=0)
    client_session_id: str | None = Field(default=None, max_length=128)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    language: str | None = Field(default=None, max_length=64)
    custom_answers: dict[str, Any] = Field(default_factory=dict)
    participants: list[ParticipantInput] = Field(default_factory=list)


class SubmissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_id: str
    form_id: str | None
    submitter_person_id: str | None
    status: str
    title: str | None
    description: str | None
    track_id: str | None
    track_ids: list[str] = Field(default_factory=list)
    format_id: str | None
    level: str | None
    capacity: int | None
    ceu_credits: float | None
    client_session_id: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    language: str | None
    reference_code: str | None
    custom_answers: dict[str, Any]
    tags: list[str]
    owner_person_id: str | None
    aggregate_rating: float | None
    notified: bool
    submitted_at: datetime | None
    created_at: datetime
    updated_at: datetime
    participants: list[ParticipantRead] = Field(default_factory=list)
    review_summary: dict[str, Any] | None = None
    can_edit: bool = True
    edit_lock_reason: str | None = None


class SubmissionListFilters(BaseModel):
    status: str | None = None
    form_id: str | None = None


class SubmitResponse(BaseModel):
    id: str
    status: str
    message: str
