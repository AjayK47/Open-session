from pydantic import BaseModel, Field


class ContactNoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class ContactTagsUpdate(BaseModel):
    tags: list[str] = Field(default_factory=list)


class PushToEventRequest(BaseModel):
    event_id: str


class BulkEmailRequest(BaseModel):
    person_ids: list[str] = Field(min_length=1)
    subject: str = Field(min_length=1, max_length=500)
    body_html: str = Field(min_length=1)
