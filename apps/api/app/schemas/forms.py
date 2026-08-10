from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

FieldType = Literal[
    "system",
    "short_text",
    "long_text",
    "number",
    "url",
    "email",
    "dropdown",
    "multi_select",
    "radio",
    "checkbox",
    "date",
    "file",
]

SystemField = Literal["title", "description", "format", "track", "tags", "level", "language", "external_id"]


class ParticipantRoleConfig(BaseModel):
    role: str = Field(min_length=1, max_length=64)
    min: int = Field(default=1, ge=0)
    max: int = Field(default=1, ge=0)


class FieldConfig(BaseModel):
    key: str = Field(min_length=1, max_length=120)
    label: str = Field(min_length=1, max_length=300)
    field_type: FieldType = "short_text"
    system_field: SystemField | None = None
    help_text: str | None = None
    required: bool = False
    placeholder: str | None = None
    options: list[str] = Field(default_factory=list)
    min_length: int | None = Field(default=None, ge=0)
    max_length: int | None = Field(default=None, ge=0)
    default_value: Any = None


class SectionConfig(BaseModel):
    key: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=300)
    instructions: str | None = None
    fields: list[FieldConfig] = Field(default_factory=list)


class RuleActionConfig(BaseModel):
    kind: Literal["show", "hide", "require"]
    target: str = Field(min_length=1)


class ConditionalRuleConfig(BaseModel):
    id: str | None = None
    field: str = Field(min_length=1)
    operator: Literal["equals", "not_equals", "contains", "any_of", "is_set", "is_not_set"]
    value: Any = None
    actions: list[RuleActionConfig] = Field(default_factory=list)


class RoutingActionConfig(BaseModel):
    kind: Literal["assign_track", "add_tag", "assign_owner", "assign_evaluation_plan"]
    value: Any = None


class RoutingTriggerConfig(BaseModel):
    field: str = Field(min_length=1)
    operator: Literal["equals", "not_equals", "contains", "any_of", "is_set", "is_not_set"]
    value: Any = None


class RoutingRuleConfig(BaseModel):
    id: str | None = None
    trigger: RoutingTriggerConfig
    actions: list[RoutingActionConfig] = Field(default_factory=list)


class FormCreate(BaseModel):
    internal_name: str = Field(min_length=1, max_length=200)
    public_title: str = Field(min_length=1, max_length=300)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=2, max_length=120)
    submission_type: Literal["abstract", "session"] = "abstract"
    participant_roles: list[ParticipantRoleConfig] = Field(
        default_factory=lambda: [ParticipantRoleConfig(role="speaker", min=1, max=1)]
    )
    sections: list[SectionConfig] = Field(default_factory=list)
    conditional_rules: list[ConditionalRuleConfig] = Field(default_factory=list)
    routing_rules: list[RoutingRuleConfig] = Field(default_factory=list)
    open_at: datetime | None = None
    close_at: datetime | None = None
    submission_limit: int | None = Field(default=None, ge=1)
    allow_multiple: bool = True
    allow_drafts: bool = True
    auto_redirect_portal: bool = False
    success_message_html: str | None = None
    edit_locked_after: datetime | None = None
    confirmation_template_id: str | None = None


class FormUpdate(BaseModel):
    internal_name: str | None = Field(default=None, min_length=1, max_length=200)
    public_title: str | None = Field(default=None, min_length=1, max_length=300)
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    submission_type: Literal["abstract", "session"] | None = None
    participant_roles: list[ParticipantRoleConfig] | None = None
    sections: list[SectionConfig] | None = None
    conditional_rules: list[ConditionalRuleConfig] | None = None
    routing_rules: list[RoutingRuleConfig] | None = None
    open_at: datetime | None = None
    close_at: datetime | None = None
    submission_limit: int | None = Field(default=None, ge=1)
    allow_multiple: bool | None = None
    allow_drafts: bool | None = None
    auto_redirect_portal: bool | None = None
    success_message_html: str | None = None
    edit_locked_after: datetime | None = None
    confirmation_template_id: str | None = None


class FormRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_id: str
    internal_name: str
    public_title: str
    slug: str
    submission_type: str
    status: str
    open_at: datetime | None
    close_at: datetime | None
    submission_limit: int | None
    allow_multiple: bool
    allow_drafts: bool
    participant_roles: list[ParticipantRoleConfig]
    sections: list[SectionConfig]
    conditional_rules: list[ConditionalRuleConfig]
    routing_rules: list[RoutingRuleConfig]
    success_message_html: str | None
    auto_redirect_portal: bool
    edit_locked_after: datetime | None
    confirmation_template_id: str | None
    created_at: datetime
    updated_at: datetime


class PublicFormEvent(BaseModel):
    name: str
    slug: str
    description: str | None


class PublicOption(BaseModel):
    """Minimal {id, name} shape for rendering track/format/tag choices on the public
    CFP without exposing full admin program-config records to unauthenticated visitors."""

    id: str
    name: str


class PublicFormRead(BaseModel):
    # Lets the public page match a speaker's existing draft to this exact form
    # when offering to resume it.
    id: str
    event: PublicFormEvent
    public_title: str
    submission_type: str
    status: str
    open_at: datetime | None
    close_at: datetime | None
    submission_limit: int | None
    # Derived from status + open_at/close_at so the public page can render a
    # closed state without re-deriving the rule client-side.
    accepting_submissions: bool = True
    closed_reason: str | None = None
    sections: list[SectionConfig]
    # The public form has to evaluate these client-side as the speaker types;
    # without them every conditional field renders unconditionally.
    conditional_rules: list[ConditionalRuleConfig] = Field(default_factory=list)
    participant_roles: list[ParticipantRoleConfig]
    success_message_html: str | None
    tracks: list[PublicOption] = Field(default_factory=list)
    formats: list[PublicOption] = Field(default_factory=list)
    tags: list[PublicOption] = Field(default_factory=list)
