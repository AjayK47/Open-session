import re
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.email import Attachment, EmailMessageInput, send_email
from app.email.ics import ICS_CONTENT_TYPE, build_ics
from app.models.comms import Communication, EmailTemplate
from app.repositories import Repositories

_TOKEN_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}")

DEFAULT_TEMPLATES: dict[str, tuple[str, str, str]] = {
    "submission_received": (
        "Submission received",
        "Submission received — {{event.name}}",
        "<p>Hi {{speaker.first_name}},</p><p>Thanks for submitting <strong>{{submission.title}}</strong> to {{event.name}}. We've received it and will be in touch after review.</p>",
    ),
    "submission_accepted": (
        "Submission accepted",
        "Great news — {{submission.title}} was accepted to {{event.name}}",
        "<p>Hi {{speaker.first_name}},</p><p>Congratulations! <strong>{{submission.title}}</strong> has been accepted to {{event.name}}.</p>{{organizer_message_html}}<p>Complete your speaker onboarding at {{portal_url}}.</p>",
    ),
    "submission_declined": (
        "Submission declined",
        "Update on {{submission.title}}",
        "<p>Hi {{speaker.first_name}},</p><p>Thank you for your submission <strong>{{submission.title}}</strong>. We appreciate the time you took, but we are unable to include it this year.</p>{{organizer_message_html}}",
    ),
    "task_reminder": (
        "Speaker task reminder",
        "Action needed: {{task.name}} for {{event.name}}",
        "<p>Hi {{speaker.first_name}},</p><p>Please complete <strong>{{task.name}}</strong> by {{task.due_date}}.</p><p>{{task.instructions}}</p>",
    ),
    "speaker_confirmation": (
        "Speaker confirmation",
        "Confirm your session at {{event.name}}",
        "<p>Hi {{speaker.first_name}},</p><p>Please confirm you will be speaking at {{event.name}}.</p>",
    ),
    "session_scheduled": (
        "Session scheduled",
        "Your session is scheduled: {{session.title}}",
        "<p>Hi {{speaker.first_name}},</p><p>{{session.title}} is scheduled on {{session.start_time}} in {{session.room}}.</p><p>A calendar invite is attached.</p>",
    ),
    "session_schedule_changed": (
        "Session schedule changed",
        "Schedule update: {{session.title}}",
        "<p>Hi {{speaker.first_name}},</p><p>The schedule for {{session.title}} changed to {{session.start_time}} in {{session.room}}.</p>",
    ),
    "calendar_invite": (
        "Calendar invitation",
        "Calendar invite: {{session.title}}",
        "<p>Calendar invite for {{session.title}} on {{session.start_time}}.</p>",
    ),
}


def ensure_default_templates(db: Session, repos: Repositories, event_id: str) -> None:
    if repos.email_templates.list_by_event(event_id):
        return
    for type_, (name, subject, html) in DEFAULT_TEMPLATES.items():
        repos.email_templates.create(
            event_id,
            {"name": name, "type": type_, "subject_template": subject, "html_template": html},
        )
    db.commit()


def render(template: str, context: dict[str, Any]) -> str:
    def _lookup(token: str) -> str:
        parts = token.split(".")
        value: Any = context
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part, "")
            else:
                value = ""
        if value is None:
            return ""
        return str(value)

    return _TOKEN_RE.sub(lambda m: _lookup(m.group(1)), template)


def _context(**kwargs: Any) -> dict[str, Any]:
    return kwargs


def send(
    db: Session,
    repos: Repositories,
    event_id: str,
    *,
    recipient_email: str,
    subject: str,
    html: str,
    text: str | None = None,
    recipient_person_id: str | None = None,
    template_id: str | None = None,
    related_submission_id: str | None = None,
    related_session_id: str | None = None,
    related_task_assignment_id: str | None = None,
    attachments: list[Attachment] | None = None,
) -> Communication:
    message_id = send_email(
        EmailMessageInput(
            to=recipient_email,
            subject=subject,
            html=html,
            text=text,
            attachments=attachments or [],
        )
    )
    communication = repos.communications.create(
        {
            "event_id": event_id,
            "recipient_person_id": recipient_person_id,
            "recipient_email": recipient_email,
            "template_id": template_id,
            "related_submission_id": related_submission_id,
            "related_session_id": related_session_id,
            "related_task_assignment_id": related_task_assignment_id,
            "status": "sent",
            "provider_message_id": message_id,
            "sent_at": utcnow(),
        }
    )
    db.commit()
    return communication


def _template_for(repos: Repositories, event_id: str, template_type: str) -> EmailTemplate | None:
    return repos.email_templates.get_by_type(event_id, template_type)


def send_automated(
    db: Session,
    repos: Repositories,
    event_id: str,
    trigger_type: str,
    recipient_person_id: str | None,
    recipient_email: str,
    context: dict[str, Any],
    *,
    related_submission_id: str | None = None,
    related_session_id: str | None = None,
    related_task_assignment_id: str | None = None,
    include_ics: bytes | None = None,
) -> Communication | None:
    """Send via the default template for `trigger_type` (and record it).

    Runs enabled automations for the trigger; if none exist, still sends using
    the seeded default template so the flow always completes.
    """
    ensure_default_templates(db, repos, event_id)
    template = _template_for(repos, event_id, trigger_type)
    if template is None:
        return None

    automations = repos.automations.list_enabled(event_id, trigger_type)
    should_send = not automations or any(a.enabled for a in automations)
    if not should_send:
        return None

    html = render(template.html_template, context)
    text = render(template.text_template or "", context) or None
    attachments: list[Attachment] = []
    if include_ics:
        attachments.append(Attachment(content=include_ics, filename="invite.ics", content_type=ICS_CONTENT_TYPE))

    return send(
        db,
        repos,
        event_id,
        recipient_email=recipient_email,
        recipient_person_id=recipient_person_id,
        subject=render(template.subject_template, context),
        html=html,
        text=text,
        template_id=template.id,
        related_submission_id=related_submission_id,
        related_session_id=related_session_id,
        related_task_assignment_id=related_task_assignment_id,
        attachments=attachments or None,
    )


def send_schedule_invite(
    db: Session,
    repos: Repositories,
    event_id: str,
    session,
    room_name: str | None,
    event_name: str,
    trigger_type: str,
    context: dict[str, Any],
) -> Communication | None:
    attendees = []
    for participant in repos.session_participants.list_for_session(session.id):
        person = repos.people.get(participant.person_id)
        if person:
            attendees.append(person.primary_email)
    ics = build_ics(
        uid=session.calendar_uid or session.id,
        summary=session.title,
        start=session.starts_at,
        end=session.ends_at,
        location=room_name or "TBD",
        description=session.description,
        sequence=session.calendar_sequence or 0,
    )
    for email in attendees:
        send_automated(
            db,
            repos,
            event_id,
            trigger_type,
            recipient_person_id=None,
            recipient_email=email,
            context=context,
            related_session_id=session.id,
            include_ics=ics,
        )
    return None


def manual_send(
    db: Session,
    repos: Repositories,
    event_id: str,
    template_id: str | None,
    subject: str,
    html: str,
    recipients: list[str],
    related_submission_id: str | None = None,
    related_session_id: str | None = None,
) -> list[Communication]:
    sent: list[Communication] = []
    for email in recipients:
        context, person = manual_recipient_context(repos, event_id, email)
        sent.append(
            send(
                db,
                repos,
                event_id,
                recipient_email=email,
                subject=render(subject, context),
                html=render(html, context),
                recipient_person_id=person.id if person else None,
                template_id=template_id,
                related_submission_id=related_submission_id,
                related_session_id=related_session_id,
            )
        )
    return sent


def manual_recipient_context(repos: Repositories, event_id: str, email: str) -> tuple[dict[str, Any], Any]:
    """Build the shared context used by both preview and the actual bulk send."""
    person = repos.people.get_by_email(email.lower().strip())
    event = repos.events.get(event_id)
    speaker = {
        "first_name": person.first_name or "" if person else "",
        "last_name": person.last_name or "" if person else "",
        "name": " ".join(filter(None, [person.first_name, person.last_name])) if person else email,
        "email": email,
    }
    return {
        "speaker": speaker,
        "event": {"name": event.name if event else "", "slug": event.slug if event else ""},
        "portal_url": f"/portal/{event.slug}" if event else "",
    }, person


def get_template(repos: Repositories, event_id: str, template_id: str) -> EmailTemplate:
    template = repos.email_templates.get(template_id)
    if template is None or template.event_id != event_id:
        raise HTTPException(status_code=404, detail="Template not found")
    return template
