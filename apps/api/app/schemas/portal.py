from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class FieldDefinitionCreate(BaseModel):
    key: str = Field(min_length=1, max_length=120)
    label: str = Field(min_length=1, max_length=300)
    field_type: str = Field(min_length=1, max_length=32)
    config: dict[str, Any] = Field(default_factory=dict)
    locked: bool = False


class FieldDefinitionUpdate(BaseModel):
    label: str | None = None
    field_type: str | None = None
    config: dict[str, Any] | None = None
    locked: bool | None = None


class PortalFormCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    target_type: Literal["contact", "group", "submission"] = "contact"
    sections: list[dict[str, Any]] = Field(default_factory=list)
    settings: dict[str, Any] = Field(default_factory=dict)


class PortalFormUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    target_type: Literal["contact", "group", "submission"] | None = None
    sections: list[dict[str, Any]] | None = None
    settings: dict[str, Any] | None = None
    status: Literal["draft", "open", "closed"] | None = None


class PortalResourceCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body_html: str = ""
    status: Literal["draft", "published"] = "draft"
    sort_order: int = 0


class PortalResourceUpdate(BaseModel):
    title: str | None = None
    body_html: str | None = None
    status: Literal["draft", "published"] | None = None
    sort_order: int | None = None


class FileRequestCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    instructions_html: str | None = None
    target_type: Literal["contact", "group", "submission"] = "contact"
    due_at: datetime | None = None
    session_id: str | None = None
    assigned_person_ids: list[str] = Field(default_factory=list)
    accepted_extensions: list[str] = Field(default_factory=lambda: ["pdf", "ppt", "pptx"])
    max_size_mb: int = Field(default=50, ge=1, le=50)


class FileRequestUpdate(BaseModel):
    title: str | None = None
    instructions_html: str | None = None
    target_type: Literal["contact", "group", "submission"] | None = None
    due_at: datetime | None = None
    session_id: str | None = None
    assigned_person_ids: list[str] | None = None
    accepted_extensions: list[str] | None = None
    max_size_mb: int | None = Field(default=None, ge=1, le=50)


class FileRequestReminderItem(BaseModel):
    request_id: str
    person_id: str


class FileRequestReminderRequest(BaseModel):
    items: list[FileRequestReminderItem] = Field(min_length=1)


class PortalFormTaskSubmit(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict)
