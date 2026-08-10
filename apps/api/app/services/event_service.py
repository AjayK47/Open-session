from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auth import AuditEvent, RoleBinding
from app.models.organization import OrganizationMembership
from app.models.program import Event
from app.repositories import Repositories
from app.schemas.events import EventCreateRequest, EventUpdate


def list_user_events(db: Session, repos: Repositories, user_id: str) -> list[Event]:
    org_membership = db.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.user_id == user_id,
            OrganizationMembership.status == "active",
            OrganizationMembership.role.in_(("owner", "admin")),
        )
    )
    if org_membership:
        return repos.events.list_by_organization(org_membership.organization_id)
    bindings = db.scalars(select(RoleBinding).where(RoleBinding.user_id == user_id)).all()
    event_ids = sorted({binding.event_id for binding in bindings})
    return repos.events.list_by_ids(event_ids)


def create_event(db: Session, repos: Repositories, user_id: str, payload: EventCreateRequest) -> Event:
    from app.models.auth import User
    from app.services import organization_service

    if repos.events.get_by_slug(payload.slug):
        raise ValueError("An event with this slug already exists.")

    user = db.get(User, user_id)
    organization = organization_service.ensure_for_event_creation(db, user)

    data = payload.model_dump(exclude={"program"})
    event = repos.events.create({**data, "organization_id": organization.id, "status": "draft"})

    db.add(RoleBinding(user_id=user_id, event_id=event.id, role="owner"))

    if payload.program:
        for track in payload.program.tracks:
            repos.tracks.create(event.id, track.model_dump())
        for room in payload.program.rooms:
            repos.rooms.create(event.id, room.model_dump())
        for fmt in payload.program.formats:
            repos.formats.create(event.id, fmt.model_dump())
        for tag in payload.program.tags:
            repos.tags.create(event.id, tag.model_dump())

    db.add(
        AuditEvent(
            user_id=user_id,
            event_id=event.id,
            action="event.created",
            payload={"name": event.name, "slug": event.slug},
        )
    )
    db.commit()
    return event


def get_event(repos: Repositories, event_id: str) -> Event | None:
    return repos.events.get(event_id)


def update_event(db: Session, repos: Repositories, user_id: str, event_id: str, patch: EventUpdate) -> Event | None:
    event = repos.events.update(event_id, patch.model_dump(exclude_none=True))
    if event is None:
        return None

    db.add(
        AuditEvent(
            user_id=user_id,
            event_id=event_id,
            action="event.updated",
            payload={"changed_fields": list(patch.model_dump(exclude_none=True).keys())},
        )
    )
    db.commit()
    return event
