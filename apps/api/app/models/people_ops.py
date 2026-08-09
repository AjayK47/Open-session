from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin
from app.core.security import new_id

if TYPE_CHECKING:
    from app.models.program import Event, Person

SPEAKER_STATUSES = ("none", "proposed", "accepted", "declined")
CONFIRMATION_STATUSES = ("unconfirmed", "confirmed", "declined")


class EventPerson(TimestampMixin, Base):
    """Person's event-specific participation (§21 EventPeople)."""

    __tablename__ = "event_people"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    person_id: Mapped[str] = mapped_column(ForeignKey("people.id"), index=True, nullable=False)
    speaker_status: Mapped[str] = mapped_column(String(16), default="none", nullable=False)
    confirmation_status: Mapped[str] = mapped_column(String(16), default="unconfirmed", nullable=False)
    onboarding_completion_percent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Organizer-defined logistics per event (travel dates, dietary needs, shirt
    # size…). Event-scoped rather than on Person because the answers change from
    # one conference to the next (SPK-15).
    custom_fields_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    __table_args__ = (UniqueConstraint("event_id", "person_id", name="uq_event_people_event_person"),)

    event: Mapped["Event"] = relationship()
    person: Mapped["Person"] = relationship()
