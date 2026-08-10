from dataclasses import dataclass
from html import escape


@dataclass(frozen=True)
class RenderedEmail:
    subject: str
    html: str
    text: str


def branded_email(
    *,
    subject: str,
    preheader: str,
    eyebrow: str,
    title: str,
    body_html: str,
    body_text: str,
    action_label: str | None = None,
    action_url: str | None = None,
    footer: str = "Open Session keeps your event programme moving.",
) -> RenderedEmail:
    """Render the shared transactional email shell.

    The layout intentionally uses nested tables and inline styles so it remains
    dependable in Gmail, Outlook, Apple Mail, and webmail clients that remove
    most document-level CSS.
    """
    action_html = ""
    action_text = ""
    action_help_html = ""
    if action_label and action_url:
        safe_url = escape(action_url, quote=True)
        action_html = f"""
          <tr>
            <td class="email-action" style="padding:4px 36px 36px">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td bgcolor="#3157d5" style="border-radius:7px">
                    <a href="{safe_url}" style="display:inline-block;padding:13px 20px;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:700;line-height:20px;text-decoration:none">{escape(action_label)}&nbsp;&nbsp;→</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>"""
        action_help_html = """
                <tr>
                  <td style="padding:0 36px 28px">
                    <div style="height:1px;background:#e5e8ee;line-height:1px">&nbsp;</div>
                    <p style="margin:18px 0 0;color:#8a91a1;font-size:12px;line-height:18px">If the button does not work, copy its link from this email into your browser.</p>
                  </td>
                </tr>"""
        action_text = f"\n\n{action_label}: {action_url}"

    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>{escape(subject)}</title>
  <style>
    @media only screen and (max-width:620px) {{
      .email-shell {{ padding:20px 12px !important; }}
      .email-header {{ padding:28px 24px 24px !important; }}
      .email-body {{ padding:28px 24px 22px !important; }}
      .email-action {{ padding-left:24px !important; padding-right:24px !important; }}
      .email-title {{ font-size:27px !important; line-height:33px !important; }}
    }}
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f5f8;color:#202534;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;-webkit-text-size-adjust:100%;text-size-adjust:100%">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent">{escape(preheader)}&#847; &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f3f5f8">
    <tr>
      <td class="email-shell" align="center" style="padding:40px 16px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px">
          <tr>
            <td style="padding:0 2px 18px">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td bgcolor="#3157d5" align="center" valign="middle" style="width:30px;height:30px;border-radius:6px;color:#ffffff;font-size:13px;font-weight:800;line-height:30px">OS</td>
                  <td style="padding-left:10px;color:#171b27;font-size:15px;font-weight:750;letter-spacing:-0.2px">Open Session</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="#ffffff" style="background:#ffffff;border:1px solid #dfe3ea;border-radius:12px;overflow:hidden">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td class="email-header" bgcolor="#171b27" style="padding:34px 36px 30px;background:#171b27">
                    <div style="margin:0 0 12px;color:#aebdf8;font-size:11px;font-weight:800;letter-spacing:1.35px;line-height:16px;text-transform:uppercase">{escape(eyebrow)}</div>
                    <h1 class="email-title" style="margin:0;color:#ffffff;font-size:30px;font-weight:680;letter-spacing:-0.7px;line-height:37px">{escape(title)}</h1>
                  </td>
                </tr>
                <tr>
                  <td class="email-body" style="padding:32px 36px 24px;color:#4f5668;font-size:15px;line-height:24px">{body_html}</td>
                </tr>
                {action_html}
                {action_help_html}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 4px 0;color:#7c8392;font-size:12px;line-height:18px">
              {escape(footer)}<br>
              This transactional message was sent through Open Session.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return RenderedEmail(
        subject=subject,
        html=html,
        text=f"{title}\n{'=' * len(title)}\n\n{body_text}{action_text}\n\n{footer}\nThis transactional message was sent through Open Session.",
    )


def sign_in_code_email(code: str, expires_minutes: int) -> RenderedEmail:
    safe_code = escape(code)
    return branded_email(
        subject=f"{code} is your Open Session sign-in code",
        preheader=f"Use {code} to finish signing in. It expires in {expires_minutes} minutes.",
        eyebrow="Secure sign-in",
        title="Finish signing in",
        body_html=(
            '<p style="margin:0 0 18px">Enter this one-time code in the Open Session sign-in window:</p>'
            '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px">'
            '<tr><td bgcolor="#f1f4fb" style="padding:16px 20px;border:1px solid #d9dfed;border-radius:8px;'
            f'color:#171b27;font-size:29px;font-weight:800;letter-spacing:8px;line-height:34px">{safe_code}</td></tr></table>'
            f'<p style="margin:0;color:#6f7686">This code expires in <strong>{expires_minutes} minutes</strong> and works only once. '
            "If you did not request it, you can safely ignore this email.</p>"
        ),
        body_text=(
            f"Enter this one-time code in the Open Session sign-in window: {code}\n\n"
            f"It expires in {expires_minutes} minutes and works only once. "
            "If you did not request it, you can safely ignore this email."
        ),
        footer="Open Session passwordless authentication",
    )


def organization_invitation_email(
    *, organization_name: str, inviter_email: str, role: str, invite_url: str
) -> RenderedEmail:
    return branded_email(
        subject=f"Join {organization_name} on Open Session",
        preheader=f"You have been invited to help run events for {organization_name}.",
        eyebrow="Workspace invitation",
        title=f"Join {organization_name}",
        body_html=(
            f'<p style="margin:0 0 16px"><strong style="color:#202534">{escape(inviter_email)}</strong> invited you to join '
            f'<strong style="color:#202534">{escape(organization_name)}</strong> as <strong style="color:#202534">{escape(role)}</strong>.</p>'
            '<p style="margin:0">Accept the invitation, then verify this email address with a one-time code to enter the workspace.</p>'
        ),
        body_text=(
            f"{inviter_email} invited you to join {organization_name} as {role}. "
            "Accept the invitation and verify this email address to continue."
        ),
        action_label="Accept invitation",
        action_url=invite_url,
        footer=f"Invitation from {organization_name}",
    )


def portal_invitation_email(*, event_name: str, recipient_name: str, portal_url: str) -> RenderedEmail:
    return branded_email(
        subject=f"Your speaker portal for {event_name}",
        preheader=f"Your private speaker workspace for {event_name} is ready.",
        eyebrow="Speaker invitation",
        title="Your speaker workspace is ready",
        body_html=(
            f'<p style="margin:0 0 16px">Hi {escape(recipient_name)},</p>'
            f'<p style="margin:0 0 16px">Your private portal for <strong style="color:#202534">{escape(event_name)}</strong> is ready.</p>'
            '<p style="margin:0">Use it to update your profile, complete onboarding tasks, upload presentation files, read organizer resources, and check your session details.</p>'
        ),
        body_text=(
            f"Hi {recipient_name},\n\nYour private speaker workspace for {event_name} is ready. "
            "Use it to update your profile, complete tasks, upload files, read resources, and check your session details."
        ),
        action_label="Open speaker portal",
        action_url=portal_url,
        footer=f"Speaker operations for {event_name}",
    )


def submission_received_email(
    *, event_name: str, form_name: str, recipient_name: str, submission_title: str
) -> RenderedEmail:
    greeting = f"Hi {escape(recipient_name)}," if recipient_name else "Hello,"
    text_greeting = f"Hi {recipient_name}," if recipient_name else "Hello,"
    return branded_email(
        subject=f"Submission received — {form_name}",
        preheader=f"We received “{submission_title}” for {event_name}.",
        eyebrow="Submission received",
        title="Your proposal is in",
        body_html=(
            f'<p style="margin:0 0 16px">{greeting}</p>'
            f'<p style="margin:0 0 20px">Thanks for submitting to <strong style="color:#202534">{escape(event_name)}</strong>. '
            "Your proposal has been received and is ready for the review team.</p>"
            '<div style="padding:16px 18px;border-left:4px solid #3157d5;background:#f3f5fa">'
            '<div style="margin:0 0 5px;color:#7a8293;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase">Proposal</div>'
            f'<div style="color:#202534;font-size:16px;font-weight:700;line-height:23px">{escape(submission_title)}</div></div>'
            '<p style="margin:20px 0 0">We will email you when there is an update. No further action is needed right now.</p>'
        ),
        body_text=(
            f'{text_greeting}\n\nThanks for submitting "{submission_title}" to {event_name}. '
            "Your proposal has been received and is ready for review. We will email you when there is an update."
        ),
        footer=f"Submission confirmation from {event_name}",
    )
