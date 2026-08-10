from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.email import EmailMessageInput, send_email
from app.email.templates import branded_email
from app.models.auth import RoleBinding, User
from app.repositories import Repositories

ROLES = ("owner", "admin", "reviewer", "speaker")


def list_team(db: Session, event_id: str) -> list[dict]:
    bindings = db.scalars(select(RoleBinding).where(RoleBinding.event_id == event_id).order_by(RoleBinding.role)).all()
    rows = []
    for binding in bindings:
        user = db.get(User, binding.user_id)
        rows.append({"user_id": binding.user_id, "email": user.email if user else None, "role": binding.role})
    return rows


def add_member(db: Session, repos: Repositories, event_id: str, email: str, role: str) -> dict:
    if role not in ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of {', '.join(ROLES)}.")
    email = email.lower().strip()
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email)
        db.add(user)
        db.flush()
    person = repos.people.upsert_by_email(email, {})
    user.person_id = person.id

    binding = db.scalar(select(RoleBinding).where(RoleBinding.user_id == user.id, RoleBinding.event_id == event_id))
    if binding is not None:
        binding.role = role
    else:
        db.add(RoleBinding(user_id=user.id, event_id=event_id, role=role))
    db.commit()

    event = repos.events.get(event_id)
    if event:
        destination = {
            "reviewer": f"/review/{event.slug}",
            "speaker": f"/portal/{event.slug}",
        }.get(role, f"/app/events/{event.id}/dashboard")
        access_url = f"{settings.web_app_url.rstrip('/')}{destination}"
        rendered = branded_email(
            subject=f"Join the {event.name} event team",
            preheader=f"You have been given {role} access to {event.name}.",
            eyebrow="Event team invitation",
            title=f"You’re invited to {event.name}",
            body_html=(
                f"<p style=\"margin:0\">You now have <strong>{role}</strong> access. "
                "Open the workspace and request a one-time sign-in code for this email address.</p>"
            ),
            body_text=(
                f"You now have {role} access to {event.name}. Open the workspace and request a one-time "
                "sign-in code for this email address."
            ),
            action_label="Open event workspace",
            action_url=access_url,
            footer=f"Invitation from the {event.name} event team",
        )
        send_email(
            EmailMessageInput(
                to=email,
                subject=rendered.subject,
                html=rendered.html,
                text=rendered.text,
            )
        )
    return {"user_id": user.id, "email": email, "role": role}


def remove_member(db: Session, event_id: str, user_id: str) -> None:
    binding = db.scalar(select(RoleBinding).where(RoleBinding.user_id == user_id, RoleBinding.event_id == event_id))
    if binding is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if binding.role == "owner":
        raise HTTPException(status_code=400, detail="Cannot remove the event owner.")
    db.delete(binding)
    db.commit()
