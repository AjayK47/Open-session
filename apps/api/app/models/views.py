from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin
from app.core.security import new_id

if TYPE_CHECKING:
    from app.models.program import Event

VIEW_RESOURCE_TYPES = ("submissions", "sessions", "speakers", "tasks")


class SavedView(TimestampMixin, Base):
    __tablename__ = "saved_views"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    owner_person_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    resource_type: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    filters_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    sorts_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    columns_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    event: Mapped["Event"] = relationship()
