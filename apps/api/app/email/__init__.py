import base64
import json
import logging
import smtplib
import urllib.error
import urllib.request
from collections.abc import Sequence
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import settings
from app.core.security import new_id

logger = logging.getLogger(__name__)


@dataclass
class Attachment:
    content: bytes
    filename: str
    content_type: str


@dataclass
class EmailMessageInput:
    to: str
    to_name: str | None = None
    subject: str = ""
    html: str | None = None
    text: str | None = None
    from_name: str | None = None
    from_address: str | None = None
    reply_to: str | None = None
    attachments: Sequence[Attachment] = field(default_factory=list)


def _render_text_from_html(html: str) -> str:
    import re

    text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text).strip()


def _send_via_cloudflare(message: EmailMessageInput, sender: str) -> str:
    """Deliver through Cloudflare Email Service's REST API.

    Chosen over SMTP for a hosted deployment: no long-lived connection and no
    port-465 egress rule, just an HTTPS call. Cloudflare returns per-recipient
    delivery status rather than a message id, so we keep our own.

    Requires an API token with `Email Sending: Edit` and a sender domain that has
    been onboarded for Email Sending on that account.
    """
    payload: dict = {
        "to": message.to,
        "from": sender,
        "subject": message.subject,
    }
    if message.html:
        payload["html"] = message.html
    if message.text:
        payload["text"] = message.text
    elif message.html:
        payload["text"] = _render_text_from_html(message.html)
    if message.reply_to:
        payload["headers"] = {"Reply-To": message.reply_to}
    if message.attachments:
        payload["attachments"] = [
            {
                "content": base64.b64encode(a.content).decode(),
                "filename": a.filename,
                "type": a.content_type,
                "disposition": "attachment",
            }
            for a in message.attachments
        ]

    url = (
        "https://api.cloudflare.com/client/v4/accounts/"
        f"{settings.cloudflare_account_id}/email/sending/send"
    )
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {settings.cloudflare_api_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            body = json.loads(response.read().decode() or "{}")
    except urllib.error.HTTPError as exc:  # pragma: no cover - network path
        detail = exc.read().decode(errors="replace")[:500]
        raise RuntimeError(f"Cloudflare rejected the message ({exc.code}): {detail}") from exc

    # A 200 can still carry success:false, so the body has to be checked too.
    if not body.get("success", False):
        errors = "; ".join(e.get("message", "") for e in body.get("errors", [])) or "unknown error"
        raise RuntimeError(f"Cloudflare rejected the message: {errors}")
    return f"{new_id()}@cloudflare"


def send_email(message: EmailMessageInput) -> str:
    """Send an email. Returns a message id.

    Three modes, chosen by settings:
      * `email_enabled=false` (default in dev) — logged, never delivered.
      * `email_provider="cloudflare"` — Cloudflare Email Service's REST API.
      * anything else — SMTP, which covers Cloudflare's authenticated SMTP
        endpoint and Mailpit/MailHog locally.
    """
    message_id = f"{new_id()}@open-session.local"

    if not settings.email_enabled:
        logger.info(
            "[DEV EMAIL] to=%s subject=%r body=%s",
            message.to,
            message.subject,
            (message.html or message.text or "")[:2000],
        )
        return message_id

    sender_name = message.from_name or settings.email_sender_name
    sender_address = message.from_address or settings.email_sender_address

    if settings.email_provider == "cloudflare":
        missing = [
            name
            for name, value in (
                ("OPEN_SESSION_CLOUDFLARE_API_TOKEN", settings.cloudflare_api_token),
                ("OPEN_SESSION_CLOUDFLARE_ACCOUNT_ID", settings.cloudflare_account_id),
            )
            if not value
        ]
        if missing:
            raise RuntimeError(f"{' and '.join(missing)} required when email_provider is 'cloudflare'.")
        return _send_via_cloudflare(message, formataddr((sender_name, sender_address)))

    msg = EmailMessage()
    msg["Subject"] = message.subject
    msg["From"] = formataddr((sender_name, sender_address))
    msg["To"] = formataddr((message.to_name, message.to)) if message.to_name else message.to
    msg["Message-ID"] = f"<{message_id}>"
    if message.reply_to:
        msg["Reply-To"] = message.reply_to

    if message.text:
        msg.set_content(message.text)
    elif message.html:
        msg.set_content(_render_text_from_html(message.html))

    if message.html:
        msg.add_alternative(message.html, subtype="html")

    for attachment in message.attachments:
        msg.add_attachment(
            attachment.content,
            maintype=attachment.content_type.split("/")[0],
            subtype=attachment.content_type.split("/", 1)[1],
            filename=attachment.filename,
        )

    # Cloudflare's submission endpoint is implicit TLS on 465 and rejects
    # STARTTLS on 587, so the transport class itself has to change.
    client = smtplib.SMTP_SSL if settings.smtp_use_ssl else smtplib.SMTP
    with client(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        if settings.smtp_use_tls and not settings.smtp_use_ssl:
            server.starttls()
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password or "")
        server.send_message(msg)

    return message_id
