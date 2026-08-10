import re
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import utcnow
from app.email import Attachment, EmailMessageInput, send_email
from app.email.ics import ICS_CONTENT_TYPE, build_ics
from app.email.templates import branded_email
from app.models.comms import Communication, EmailTemplate
from app.repositories import Repositories

_TOKEN_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}")

DEFAULT_TEMPLATES: dict[str, tuple[str, str, str, str]] = {
    "submission_received": (
        "Submission received",
        "We received “{{submission.title}}” — {{event.name}}",
        '<p style="margin:0 0 16px">Hi {{speaker.first_name}},</p><p style="margin:0 0 20px">Thanks for submitting to <strong style="color:#202534">{{event.name}}</strong>. Your proposal is now with the programme team.</p><div style="padding:16px 18px;border-left:4px solid #3157d5;background:#f3f5fa"><div style="margin:0 0 5px;color:#7a8293;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase">Proposal</div><div style="color:#202534;font-size:16px;font-weight:700;line-height:23px">{{submission.title}}</div></div><p style="margin:20px 0 0">We will email you when there is an update. No action is needed right now.</p>',
        "Hi {{speaker.first_name}},\n\nThanks for submitting “{{submission.title}}” to {{event.name}}. Your proposal is now with the programme team. We will email you when there is an update.",
    ),
    "submission_accepted": (
        "Submission accepted",
        "You’re speaking at {{event.name}}",
        '<p style="margin:0 0 16px">Hi {{speaker.first_name}},</p><p style="margin:0 0 20px">We’re delighted to invite you to speak at <strong style="color:#202534">{{event.name}}</strong>.</p><div style="padding:16px 18px;border-left:4px solid #20a36a;background:#f0f8f4"><div style="margin:0 0 5px;color:#56806c;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase">Accepted session</div><div style="color:#173c2d;font-size:16px;font-weight:700;line-height:23px">{{submission.title}}</div></div>{{organizer_message_html}}<p style="margin:20px 0 0">Open your speaker portal to confirm your details and complete the onboarding requests from the event team.</p>',
        "Hi {{speaker.first_name}},\n\nWe’re delighted to invite you to speak at {{event.name}}. Your proposal “{{submission.title}}” has been accepted.\n\n{{organizer_message}}\n\nOpen your speaker portal to complete onboarding.",
    ),
    "submission_declined": (
        "Submission declined",
        "An update on your {{event.name}} proposal",
        '<p style="margin:0 0 16px">Hi {{speaker.first_name}},</p><p style="margin:0 0 16px">Thank you for the time and thought you put into <strong style="color:#202534">{{submission.title}}</strong>.</p><p style="margin:0">After review, we’re unable to include this proposal in the {{event.name}} programme. We know preparing a submission takes real work, and we appreciate your interest in the event.</p>{{organizer_message_html}}',
        "Hi {{speaker.first_name}},\n\nThank you for the time and thought you put into “{{submission.title}}”. After review, we’re unable to include this proposal in the {{event.name}} programme. We appreciate your interest in the event.\n\n{{organizer_message}}",
    ),
    "task_reminder": (
        "Speaker task reminder",
        "Action needed: {{task.name}} — {{event.name}}",
        '<p style="margin:0 0 16px">Hi {{speaker.first_name}},</p><p style="margin:0 0 20px">The event team is waiting on one item from you.</p><div style="padding:16px 18px;border-left:4px solid #e39b24;background:#fcf7ec"><div style="margin:0 0 5px;color:#856b3c;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase">Due {{task.due_date}}</div><div style="color:#44351c;font-size:16px;font-weight:700;line-height:23px">{{task.name}}</div></div><div style="margin:20px 0 0">{{task.instructions}}</div>',
        "Hi {{speaker.first_name}},\n\nThe {{event.name}} team is waiting on: {{task.name}}. Due: {{task.due_date}}.\n\n{{task.instructions}}",
    ),
    "speaker_confirmation": (
        "Speaker confirmation",
        "Please confirm your session — {{event.name}}",
        '<p style="margin:0 0 16px">Hi {{speaker.first_name}},</p><p style="margin:0">Please confirm that you will be speaking at <strong style="color:#202534">{{event.name}}</strong>. Your confirmation helps the team finalize the programme and publish accurate speaker information.</p>',
        "Hi {{speaker.first_name}},\n\nPlease confirm that you will be speaking at {{event.name}}. Your confirmation helps the team finalize the programme.",
    ),
    "session_scheduled": (
        "Session scheduled",
        "Your session is scheduled — {{event.name}}",
        '<p style="margin:0 0 16px">Hi {{speaker.first_name}},</p><p style="margin:0 0 20px">Your session has been placed on the programme.</p><div style="padding:16px 18px;border-left:4px solid #3157d5;background:#f3f5fa"><div style="color:#202534;font-size:16px;font-weight:700;line-height:23px">{{session.title}}</div><div style="margin-top:7px;color:#606879;font-size:13px;line-height:20px">{{session.start_time}} · {{session.room}}</div></div><p style="margin:20px 0 0">A calendar invitation is attached. Open it to add the session to any calendar app.</p>',
        "Hi {{speaker.first_name}},\n\nYour session “{{session.title}}” is scheduled for {{session.start_time}} in {{session.room}}. A calendar invitation is attached.",
    ),
    "session_schedule_changed": (
        "Session schedule changed",
        "Schedule change for {{session.title}}",
        '<p style="margin:0 0 16px">Hi {{speaker.first_name}},</p><p style="margin:0 0 20px">The time or location of your session has changed. Please use the updated details below.</p><div style="padding:16px 18px;border-left:4px solid #3157d5;background:#f3f5fa"><div style="color:#202534;font-size:16px;font-weight:700;line-height:23px">{{session.title}}</div><div style="margin-top:7px;color:#606879;font-size:13px;line-height:20px">{{session.start_time}} · {{session.room}}</div></div><p style="margin:20px 0 0">The attached calendar invitation contains the latest schedule.</p>',
        "Hi {{speaker.first_name}},\n\nThe schedule for “{{session.title}}” has changed. The latest time is {{session.start_time}} in {{session.room}}. The attached calendar invitation contains the update.",
    ),
    "calendar_invite": (
        "Calendar invitation",
        "Calendar invitation: {{session.title}}",
        '<p style="margin:0 0 16px">Your calendar invitation for <strong style="color:#202534">{{session.title}}</strong> is attached.</p><p style="margin:0">Scheduled for {{session.start_time}} in {{session.room}}.</p>',
        "Your calendar invitation for “{{session.title}}” is attached. Scheduled for {{session.start_time}} in {{session.room}}.",
    ),
}


AUTOMATED_PRESENTATION: dict[str, tuple[str, str, str | None]] = {
    "submission_received": ("Submission received", "Your proposal is in", None),
    "submission_accepted": ("Programme decision", "You’re on the programme", "Open speaker portal"),
    "submission_declined": ("Programme decision", "A note about your proposal", None),
    "task_reminder": ("Speaker onboarding", "A task needs your attention", "Open speaker portal"),
    "speaker_confirmation": ("Speaker confirmation", "Please confirm your session", "Open speaker portal"),
    "session_scheduled": ("Programme update", "Your session is scheduled", "View session details"),
    "session_schedule_changed": ("Schedule update", "Your session details changed", "View session details"),
    "calendar_invite": ("Calendar invitation", "Add your session to your calendar", None),
}


def ensure_default_templates(db: Session, repos: Repositories, event_id: str) -> None:
    if repos.email_templates.list_by_event(event_id):
        return
    for type_, (name, subject, html, text) in DEFAULT_TEMPLATES.items():
        repos.email_templates.create(
            event_id,
            {
                "name": name,
                "type": type_,
                "subject_template": subject,
                "html_template": html,
                "text_template": text,
            },
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
    eyebrow: str | None = None,
    title: str | None = None,
    action_label: str | None = None,
    action_url: str | None = None,
) -> Communication:
    event = repos.events.get(event_id)
    branded = branded_email(
        subject=subject,
        preheader=subject,
        eyebrow=eyebrow or (event.name if event else "Event update"),
        title=title or subject,
        body_html=html,
        body_text=text or re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip(),
        action_label=action_label,
        action_url=action_url,
        footer=f"Sent by the {event.name} event team" if event else "Sent by your event team",
    )
    message_id = send_email(
        EmailMessageInput(
            to=recipient_email,
            subject=branded.subject,
            html=branded.html,
            text=branded.text,
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

    event = repos.events.get(event_id)
    presentation = AUTOMATED_PRESENTATION.get(trigger_type)
    eyebrow, title, action_label = presentation or (event.name if event else "Event update", "Event update", None)
    portal_url = context.get("portal_url") or (
        f"{settings.web_app_url.rstrip('/')}/portal/{event.slug}" if event else None
    )

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
        eyebrow=eyebrow,
        title=render(title, context),
        action_label=action_label,
        action_url=portal_url if action_label else None,
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
