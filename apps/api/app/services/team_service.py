from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

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
    return {"user_id": user.id, "email": email, "role": role}


def remove_member(db: Session, event_id: str, user_id: str) -> None:
    binding = db.scalar(select(RoleBinding).where(RoleBinding.user_id == user_id, RoleBinding.event_id == event_id))
    if binding is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if binding.role == "owner":
        raise HTTPException(status_code=400, detail="Cannot remove the event owner.")
    db.delete(binding)
    db.commit()
