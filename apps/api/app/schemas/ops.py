from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# --- Submissions (manual / decision / bulk) --------------------------------


class SubmissionUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    description: str | None = None
    track_id: str | None = None
    track_ids: list[str] | None = None
    format_id: str | None = None
    level: str | None = None
    capacity: int | None = Field(default=None, ge=0)
    ceu_credits: float | None = Field(default=None, ge=0)
    client_session_id: str | None = Field(default=None, max_length=128)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    language: str | None = None
    tags: list[str] | None = None
    custom_answers: dict[str, Any] | None = None
    participants: list[Any] | None = None


class ManualSubmissionCreate(BaseModel):
    form_id: str | None = None
    status: str | None = None
    title: str = Field(min_length=1, max_length=500)
    description: str | None = None
    track_id: str | None = None
    track_ids: list[str] | None = None
    format_id: str | None = None
    level: str | None = None
    capacity: int | None = Field(default=None, ge=0)
    ceu_credits: float | None = Field(default=None, ge=0)
    client_session_id: str | None = Field(default=None, max_length=128)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    language: str | None = None
    tags: list[str] = Field(default_factory=list)
    custom_answers: dict[str, Any] = Field(default_factory=dict)
    participants: list[Any] = Field(default_factory=list)


class DecisionRequest(BaseModel):
    decision: str
    notify: bool = True
    # Free-text note from the organizer, included in the accept/decline email so
    # a decision can carry requested changes or feedback instead of arriving bare.
    message: str | None = Field(default=None, max_length=5000)


class BulkDecisionRequest(BaseModel):
    submission_ids: list[str]
    target: str
    notify: bool = True
    message: str | None = Field(default=None, max_length=5000)


# --- Evaluations ------------------------------------------------------------


class CriterionConfig(BaseModel):
    key: str = Field(min_length=1)
    label: str = Field(min_length=1)
    description: str | None = None
    # ABS-03 wants numeric, dropdown and free-text criteria to all render and
    # store on the reviewer side.
    type: Literal["numeric", "dropdown", "yes_no", "text"] = "numeric"
    options: list[str] = Field(default_factory=list)
    scale_max: int = 5
    weight: float = 1.0
    required: bool = True


class PlanScope(BaseModel):
    form_id: str | None = None
    track_ids: list[str] = Field(default_factory=list)


class EvaluationPlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    instructions: str | None = None
    opens_at: datetime | None = None
    closes_at: datetime | None = None
    scope: PlanScope = Field(default_factory=PlanScope)
    criteria: list[CriterionConfig] = Field(default_factory=lambda: [{"key": "quality", "label": "Overall quality"}])
    reviews_required: int = Field(default=1, ge=1)
    blind_review: bool = False
    round_number: int = 1


class EvaluationPlanUpdate(BaseModel):
    name: str | None = None
    instructions: str | None = None
    opens_at: datetime | None = None
    closes_at: datetime | None = None
    scope: PlanScope | None = None
    criteria: list[CriterionConfig] | None = None
    reviews_required: int | None = Field(default=None, ge=1)
    blind_review: bool | None = None
    round_number: int | None = Field(default=None, ge=1)


class AssignReviewersRequest(BaseModel):
    reviewers: list[EmailStr]
    submission_ids: list[str] | None = None
    # ABS-06: "every" gives each reviewer the whole set; "distribute" spreads the
    # set across reviewers round-robin. `per_reviewer_cap` bounds either.
    strategy: Literal["every", "distribute"] = "every"
    per_reviewer_cap: int | None = Field(default=None, ge=1)
    track_ids: list[str] = Field(default_factory=list)
    due_at: datetime | None = None


class RecusalRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


class AiReviewOverrideRequest(BaseModel):
    score: float = Field(ge=0, le=10)
    reason: str = Field(min_length=1, max_length=2000)


class ReviewWrite(BaseModel):
    scores: dict[str, Any] = Field(default_factory=dict)
    comments: str | None = None
    submit: bool = False


class ReviewerAssignmentRead(BaseModel):
    id: str
    submission_id: str
    title: str | None
    track_id: str | None
    status: str
    due_at: datetime | None
    plan_id: str | None
    plan_name: str | None


# --- Sessions / agenda -------------------------------------------------------


class SessionParticipantInput(BaseModel):
    email: EmailStr
    role: str = Field(default="speaker", max_length=64)
    first_name: str | None = None
    last_name: str | None = None
    company: str | None = None
    job_title: str | None = None


class SessionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str | None = None
    track_id: str | None = None
    format_id: str | None = None
    duration_minutes: int | None = Field(default=None, gt=0)
    capacity: int | None = Field(default=None, ge=0)
    ceu_credits: float | None = Field(default=None, ge=0)
    chairperson: str | None = None
    language: str | None = None
    location: str | None = None
    participants: list[SessionParticipantInput] = Field(default_factory=list)


class SessionUpdate(BaseModel):
    title: str | None = None
    status: Literal["draft", "confirmed", "scheduled", "published", "cancelled"] | None = None
    # Content review state (CNT-12). Only "approved" sessions reach the public
    # widgets, so this is the organizer's gate on what attendees can see.
    approval_status: Literal["pending", "approved", "rejected"] | None = None
    description: str | None = None
    track_id: str | None = None
    format_id: str | None = None
    duration_minutes: int | None = Field(default=None, gt=0)
    capacity: int | None = Field(default=None, ge=0)
    ceu_credits: float | None = Field(default=None, ge=0)
    chairperson: str | None = None
    language: str | None = None
    location: str | None = None
    participants: list[SessionParticipantInput] | None = None


class ScheduleRequest(BaseModel):
    room_id: str | None = None
    starts_at: datetime
    ends_at: datetime
    allow_soft: bool = False


class SessionImportCommit(BaseModel):
    rows: list[dict[str, Any]]
    mapping: dict[str, str] = Field(default_factory=dict)


# --- Tasks -------------------------------------------------------------------


class TaskTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    instructions: str | None = None
    task_type: Literal["confirmation", "profile", "file_upload", "custom", "form"] = "custom"
    required: bool = True
    due_rule: dict[str, Any] = Field(default_factory=dict)
    applies_when: dict[str, Any] = Field(default_factory=dict)
    target_type: Literal["contact", "group", "submission"] = "contact"
    portal_form_id: str | None = None


class TaskTemplateUpdate(BaseModel):
    name: str | None = None
    instructions: str | None = None
    task_type: Literal["confirmation", "profile", "file_upload", "custom", "form"] | None = None
    required: bool | None = None
    due_rule: dict[str, Any] | None = None
    applies_when: dict[str, Any] | None = None
    target_type: Literal["contact", "group", "submission"] | None = None
    portal_form_id: str | None = None


class TaskTemplateCopyRequest(BaseModel):
    source_event_id: str
    template_ids: list[str] = Field(default_factory=list)


class GenerateAssignmentsRequest(BaseModel):
    person_id: str
    session_id: str | None = None
    submission_id: str | None = None


class BatchTaskAssignmentRequest(BaseModel):
    template_id: str
    person_ids: list[str] = Field(min_length=1)
    due_at: datetime | None = None
    session_id: str | None = None


class CompleteTaskRequest(BaseModel):
    completion_data: dict[str, Any] | None = None


# --- Speakers -----------------------------------------------------------------


class ProfileUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    bio: str | None = None
    company: str | None = None
    job_title: str | None = None
    phone: str | None = None
    website: str | None = None
    linkedin_url: str | None = None
    x_url: str | None = None


class SpeakerCreate(ProfileUpdate):
    email: EmailStr
    speaker_status: str = "invited"
    confirmation_status: str = "unconfirmed"
    custom_fields: dict[str, Any] = Field(default_factory=dict)


class SpeakerOrganizerUpdate(ProfileUpdate):
    speaker_status: str | None = None
    confirmation_status: str | None = None
    custom_fields: dict[str, Any] | None = None


# --- Files --------------------------------------------------------------------


class FileCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class UploadIntentRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=128)
    size_bytes: int | None = Field(default=None, ge=0)
    file_type: Literal["headshot", "slides", "supporting", "submission"]
    person_id: str | None = None
    submission_id: str | None = None
    session_id: str | None = None
    task_assignment_id: str | None = None
    file_request_id: str | None = None


class UploadIntentResponse(BaseModel):
    id: str
    upload_url: str


# --- Communications -------------------------------------------------------------


class EmailTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    type: str = Field(min_length=1, max_length=64)
    subject_template: str = Field(min_length=1)
    html_template: str = Field(min_length=1)
    text_template: str | None = None


class EmailTemplateUpdate(BaseModel):
    name: str | None = None
    subject_template: str | None = None
    html_template: str | None = None
    text_template: str | None = None


class AutomationCreate(BaseModel):
    trigger_type: Literal[
        "submission_received",
        "submission_accepted",
        "submission_declined",
        "task_assigned",
        "task_due_soon",
        "task_overdue",
        "session_scheduled",
        "session_schedule_changed",
    ]
    conditions: dict[str, Any] = Field(default_factory=dict)
    template_id: str | None = None
    include_calendar_invite: bool = False
    enabled: bool = True


class AutomationUpdate(BaseModel):
    conditions: dict[str, Any] | None = None
    template_id: str | None = None
    include_calendar_invite: bool | None = None
    enabled: bool | None = None


class ManualSendRequest(BaseModel):
    template_id: str | None = None
    subject: str | None = None
    html: str | None = None
    recipients: list[EmailStr] = Field(min_length=1)
    related_submission_id: str | None = None
    related_session_id: str | None = None


class ManualSendPreview(BaseModel):
    recipient_email: EmailStr
    recipient_name: str
    subject: str
    html: str


# --- Saved views ----------------------------------------------------------------


class SavedViewCreate(BaseModel):
    resource_type: Literal["submissions", "sessions", "speakers", "tasks"]
    name: str = Field(min_length=1, max_length=120)
    filters: dict[str, Any] = Field(default_factory=dict)
    sorts: list[dict[str, Any]] = Field(default_factory=list)
    columns: list[str] = Field(default_factory=list)


class SavedViewUpdate(BaseModel):
    name: str | None = None
    filters: dict[str, Any] | None = None
    sorts: list[dict[str, Any]] | None = None
    columns: list[str] | None = None


class SavedViewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_id: str
    owner_person_id: str
    resource_type: str
    name: str
    filters: dict[str, Any]
    sorts: list[dict[str, Any]]
    columns: list[str]


# --- Team / API keys -----------------------------------------------------------


class AddMemberRequest(BaseModel):
    email: EmailStr
    role: Literal["owner", "admin", "reviewer", "speaker"]


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    scopes: list[str] = Field(default_factory=list)
    expires_at: datetime | None = None


class ApiKeyCreated(BaseModel):
    id: str
    name: str
    scopes: list[str]
    key: str  # plaintext, shown once


class ApiKeyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_id: str | None
    name: str
    scopes: list[str]
    expires_at: datetime | None
    created_at: datetime
    last_used_at: datetime | None
