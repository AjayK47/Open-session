from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.security import new_id
from app.models.cfp import SubmissionForm
from app.models.program import Event
from app.repositories import Repositories
from app.schemas.forms import (
    ConditionalRuleConfig,
    FormCreate,
    FormRead,
    FormUpdate,
    ParticipantRoleConfig,
    PublicFormEvent,
    PublicFormRead,
    PublicOption,
    RoutingRuleConfig,
    SectionConfig,
)

_JSON_FIELDS = {
    "participant_roles": "participant_roles_json",
    "sections": "sections_fields_json",
    "conditional_rules": "conditional_rules_json",
    "routing_rules": "routing_rules_json",
}


def form_to_read(form: SubmissionForm) -> FormRead:
    return FormRead(
        id=form.id,
        event_id=form.event_id,
        internal_name=form.internal_name,
        public_title=form.public_title,
        slug=form.slug,
        submission_type=form.submission_type,
        status=form.status,
        open_at=form.open_at,
        close_at=form.close_at,
        submission_limit=form.submission_limit,
        allow_multiple=form.allow_multiple,
        allow_drafts=form.allow_drafts,
        participant_roles=[ParticipantRoleConfig(**p) for p in (form.participant_roles_json or [])],
        sections=[SectionConfig(**s) for s in (form.sections_fields_json or [])],
        conditional_rules=[ConditionalRuleConfig(**r) for r in (form.conditional_rules_json or [])],
        routing_rules=[RoutingRuleConfig(**r) for r in (form.routing_rules_json or [])],
        success_message_html=form.success_message_html,
        auto_redirect_portal=form.auto_redirect_portal,
        edit_locked_after=form.edit_locked_after,
        confirmation_template_id=form.confirmation_template_id,
        created_at=form.created_at,
        updated_at=form.updated_at,
    )


def _dump(payload, *, exclude_unset: bool = False) -> dict:
    dump = payload.model_dump(exclude_unset=exclude_unset)
    data: dict = {}
    for key, value in dump.items():
        column = _JSON_FIELDS.get(key)
        if column:
            data[column] = [item.model_dump() if hasattr(item, "model_dump") else item for item in (value or [])]
        else:
            data[key] = value
    return data


def list_forms(repos: Repositories, event_id: str) -> list[SubmissionForm]:
    return repos.forms.list_by_event(event_id)


def _validate_confirmation_template(repos: Repositories, event_id: str, template_id: str | None) -> None:
    if template_id is None:
        return
    template = repos.email_templates.get(template_id)
    if template is None or template.event_id != event_id or template.type != "submission_received":
        raise HTTPException(status_code=400, detail="Select a submission confirmation template from this event.")


def create_form(db: Session, repos: Repositories, event_id: str, payload: FormCreate) -> SubmissionForm:
    if repos.forms.get_by_slug(event_id, payload.slug):
        raise HTTPException(status_code=409, detail="A form with this slug already exists.")
    _validate_confirmation_template(repos, event_id, payload.confirmation_template_id)
    form = repos.forms.create(event_id, _dump(payload))
    db.commit()
    return form


def get_form(repos: Repositories, form_id: str) -> SubmissionForm | None:
    return repos.forms.get(form_id)


def update_form(db: Session, repos: Repositories, form_id: str, payload: FormUpdate) -> SubmissionForm:
    patch = _dump(payload, exclude_unset=True)
    current = repos.forms.get(form_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Form not found")
    if "confirmation_template_id" in patch:
        _validate_confirmation_template(repos, current.event_id, patch["confirmation_template_id"])
    if "slug" in patch and patch["slug"] is not None:
        if repos.forms.get_by_slug(current.event_id, patch["slug"]) and patch["slug"] != current.slug:
            raise HTTPException(status_code=409, detail="A form with this slug already exists.")
    form = repos.forms.update(form_id, patch)
    if form is None:
        raise HTTPException(status_code=404, detail="Form not found")
    db.commit()
    return form


def delete_form(db: Session, repos: Repositories, form_id: str) -> None:
    form = repos.forms.get(form_id)
    if form is None:
        raise HTTPException(status_code=404, detail="Form not found")
    if repos.submissions.list_by_event(form.event_id, {"form_id": form.id}):
        raise HTTPException(
            status_code=409,
            detail="This form has submissions and cannot be deleted. Close it instead.",
        )
    repos.forms.delete(form_id)
    db.commit()


def set_status(db: Session, repos: Repositories, form_id: str, status: str) -> SubmissionForm:
    form = repos.forms.get(form_id)
    if form is None:
        raise HTTPException(status_code=404, detail="Form not found")
    form.status = status
    db.commit()
    return form


def duplicate_form(db: Session, repos: Repositories, form_id: str) -> SubmissionForm:
    source = repos.forms.get(form_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Form not found")

    data = {
        "internal_name": f"{source.internal_name} (copy)",
        "public_title": source.public_title,
        "slug": f"{source.slug}-{new_id()[:6]}",
        "submission_type": source.submission_type,
        "status": "draft",
        "open_at": None,
        "close_at": None,
        "submission_limit": source.submission_limit,
        "allow_multiple": source.allow_multiple,
        "allow_drafts": source.allow_drafts,
        "participant_roles_json": source.participant_roles_json or [],
        "sections_fields_json": source.sections_fields_json or [],
        "conditional_rules_json": source.conditional_rules_json or [],
        "routing_rules_json": source.routing_rules_json or [],
        "success_message_html": source.success_message_html,
        "auto_redirect_portal": source.auto_redirect_portal,
        "confirmation_template_id": None,
        "admin_notification_config_json": source.admin_notification_config_json or {},
    }
    form = repos.forms.create(source.event_id, data)
    db.commit()
    return form


def _accepting(form: SubmissionForm) -> tuple[bool, str | None]:
    # Imported lazily: submission_service imports form_service at module scope.
    from app.services.submission_service import submission_window_state

    return submission_window_state(form)


def public_form_schema(event: Event, form: SubmissionForm, repos: Repositories) -> PublicFormRead:
    """Includes track/format/tag option lists so the public form can render the
    system fields (Format/Track/Tags) as real choices, not free text (§9.3)."""
    return PublicFormRead(
        id=form.id,
        event=PublicFormEvent(name=event.name, slug=event.slug, description=event.description),
        public_title=form.public_title,
        submission_type=form.submission_type,
        status=form.status,
        open_at=form.open_at,
        close_at=form.close_at,
        submission_limit=form.submission_limit,
        accepting_submissions=_accepting(form)[0],
        closed_reason=_accepting(form)[1],
        sections=[SectionConfig(**s) for s in (form.sections_fields_json or [])],
        conditional_rules=[ConditionalRuleConfig(**r) for r in (form.conditional_rules_json or [])],
        participant_roles=[ParticipantRoleConfig(**p) for p in (form.participant_roles_json or [])],
        success_message_html=form.success_message_html,
        tracks=[PublicOption(id=t.id, name=t.name) for t in repos.tracks.list_by_event(event.id) if t.active],
        formats=[PublicOption(id=f.id, name=f.name) for f in repos.formats.list_by_event(event.id)],
        tags=[PublicOption(id=t.id, name=t.name) for t in repos.tags.list_by_event(event.id)],
    )
