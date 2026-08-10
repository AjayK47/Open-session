from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.models.cfp import Submission, SubmissionForm, SubmissionParticipant, SubmissionTrack
from app.models.program import Event, Person, Room, SessionFormat, Tag, Track
from app.repositories.interfaces import (
    EventRepository,
    FormatRepository,
    FormRepository,
    PersonRepository,
    RoomRepository,
    SubmissionParticipantRepository,
    SubmissionRepository,
    SubmissionTrackRepository,
    TagRepository,
    TrackRepository,
)


class SqlAlchemyEventRepository(EventRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_ids(self, event_ids: list[str]) -> list[Event]:
        if not event_ids:
            return []
        stmt = select(Event).where(Event.id.in_(event_ids)).order_by(Event.created_at.desc())
        return list(self.db.scalars(stmt))

    def list_by_organization(self, organization_id: str) -> list[Event]:
        stmt = select(Event).where(Event.organization_id == organization_id).order_by(Event.created_at.desc())
        return list(self.db.scalars(stmt))

    def get(self, event_id: str) -> Event | None:
        return self.db.get(Event, event_id)

    def get_by_slug(self, slug: str) -> Event | None:
        stmt = select(Event).where(Event.slug == slug)
        return self.db.scalar(stmt)

    def list_published(self) -> list[Event]:
        stmt = (
            select(Event)
            .where(Event.agenda_published_at.is_not(None))
            .order_by(Event.starts_at.asc(), Event.created_at.asc())
        )
        return list(self.db.scalars(stmt))

    def create(self, data: dict) -> Event:
        event = Event(**data)
        self.db.add(event)
        self.db.flush()
        return event

    def update(self, event_id: str, patch: dict) -> Event | None:
        event = self.get(event_id)
        if event is None:
            return None
        for key, value in patch.items():
            setattr(event, key, value)
        self.db.flush()
        return event

    def count(self) -> int:
        return self.db.scalar(select(func.count()).select_from(Event)) or 0

    def allocate_submission_number(self, event_id: str) -> int:
        self.db.execute(
            update(Event)
            .where(Event.id == event_id)
            .values(submission_counter=func.coalesce(Event.submission_counter, 0) + 1)
        )
        self.db.flush()
        value = self.db.scalar(select(Event.submission_counter).where(Event.id == event_id))
        if value is None:
            raise ValueError("Event not found")
        return int(value)


class SqlAlchemyTrackRepository(TrackRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_event(self, event_id: str) -> list[Track]:
        stmt = select(Track).where(Track.event_id == event_id).order_by(Track.created_at.asc())
        return list(self.db.scalars(stmt))

    def get(self, track_id: str) -> Track | None:
        return self.db.get(Track, track_id)

    def create(self, event_id: str, data: dict) -> Track:
        track = Track(event_id=event_id, **data)
        self.db.add(track)
        self.db.flush()
        return track

    def update(self, track_id: str, patch: dict) -> Track | None:
        track = self.get(track_id)
        if track is None:
            return None
        for key, value in patch.items():
            setattr(track, key, value)
        self.db.flush()
        return track


class SqlAlchemyRoomRepository(RoomRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_event(self, event_id: str) -> list[Room]:
        stmt = select(Room).where(Room.event_id == event_id).order_by(Room.created_at.asc())
        return list(self.db.scalars(stmt))

    def get(self, room_id: str) -> Room | None:
        return self.db.get(Room, room_id)

    def create(self, event_id: str, data: dict) -> Room:
        room = Room(event_id=event_id, **data)
        self.db.add(room)
        self.db.flush()
        return room

    def update(self, room_id: str, patch: dict) -> Room | None:
        room = self.get(room_id)
        if room is None:
            return None
        for key, value in patch.items():
            setattr(room, key, value)
        self.db.flush()
        return room


class SqlAlchemyFormatRepository(FormatRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_event(self, event_id: str) -> list[SessionFormat]:
        stmt = select(SessionFormat).where(SessionFormat.event_id == event_id).order_by(SessionFormat.created_at.asc())
        return list(self.db.scalars(stmt))

    def get(self, format_id: str) -> SessionFormat | None:
        return self.db.get(SessionFormat, format_id)

    def create(self, event_id: str, data: dict) -> SessionFormat:
        fmt = SessionFormat(event_id=event_id, **data)
        self.db.add(fmt)
        self.db.flush()
        return fmt

    def update(self, format_id: str, patch: dict) -> SessionFormat | None:
        fmt = self.get(format_id)
        if fmt is None:
            return None
        for key, value in patch.items():
            setattr(fmt, key, value)
        self.db.flush()
        return fmt


class SqlAlchemyTagRepository(TagRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_event(self, event_id: str) -> list[Tag]:
        stmt = select(Tag).where(Tag.event_id == event_id).order_by(Tag.created_at.asc())
        return list(self.db.scalars(stmt))

    def get(self, tag_id: str) -> Tag | None:
        return self.db.get(Tag, tag_id)

    def create(self, event_id: str, data: dict) -> Tag:
        tag = Tag(event_id=event_id, **data)
        self.db.add(tag)
        self.db.flush()
        return tag

    def update(self, tag_id: str, patch: dict) -> Tag | None:
        tag = self.get(tag_id)
        if tag is None:
            return None
        for key, value in patch.items():
            setattr(tag, key, value)
        self.db.flush()
        return tag


class SqlAlchemyPersonRepository(PersonRepository):
    def __init__(self, db: Session):
        self.db = db

    def get(self, person_id: str) -> Person | None:
        return self.db.get(Person, person_id)

    def get_by_email(self, email: str) -> Person | None:
        stmt = select(Person).where(Person.primary_email == email)
        return self.db.scalar(stmt)

    def upsert_by_email(self, email: str, data: dict) -> Person:
        person = self.get_by_email(email)
        if person is None:
            person = Person(primary_email=email, **data)
            self.db.add(person)
            self.db.flush()
            return person
        for key, value in data.items():
            setattr(person, key, value)
        self.db.flush()
        return person


class SqlAlchemyFormRepository(FormRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_event(self, event_id: str) -> list[SubmissionForm]:
        stmt = (
            select(SubmissionForm).where(SubmissionForm.event_id == event_id).order_by(SubmissionForm.created_at.asc())
        )
        return list(self.db.scalars(stmt))

    def get(self, form_id: str) -> SubmissionForm | None:
        return self.db.get(SubmissionForm, form_id)

    def get_by_slug(self, event_id: str, slug: str) -> SubmissionForm | None:
        stmt = select(SubmissionForm).where(SubmissionForm.event_id == event_id, SubmissionForm.slug == slug)
        return self.db.scalar(stmt)

    def create(self, event_id: str, data: dict) -> SubmissionForm:
        form = SubmissionForm(event_id=event_id, **data)
        self.db.add(form)
        self.db.flush()
        return form

    def update(self, form_id: str, patch: dict) -> SubmissionForm | None:
        form = self.get(form_id)
        if form is None:
            return None
        for key, value in patch.items():
            setattr(form, key, value)
        self.db.flush()
        return form

    def delete(self, form_id: str) -> bool:
        form = self.get(form_id)
        if form is None:
            return False
        self.db.delete(form)
        self.db.flush()
        return True


class SqlAlchemySubmissionRepository(SubmissionRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_event(self, event_id: str, filters: dict | None = None) -> list[Submission]:
        stmt = select(Submission).where(Submission.event_id == event_id)
        if filters:
            if filters.get("status"):
                stmt = stmt.where(Submission.status == filters["status"])
            if filters.get("form_id"):
                stmt = stmt.where(Submission.form_id == filters["form_id"])
            if filters.get("reference_code"):
                stmt = stmt.where(Submission.reference_code == filters["reference_code"])
            if filters.get("track_id"):
                stmt = stmt.where(Submission.track_id == filters["track_id"])
        stmt = stmt.order_by(Submission.created_at.desc())
        return list(self.db.scalars(stmt))

    def list_for_person(self, person_id: str) -> list[Submission]:
        stmt = (
            select(Submission).where(Submission.submitter_person_id == person_id).order_by(Submission.created_at.desc())
        )
        return list(self.db.scalars(stmt))

    def list_involving_person(self, person_id: str) -> list[Submission]:
        participant_ids = select(SubmissionParticipant.submission_id).where(
            SubmissionParticipant.person_id == person_id
        )
        stmt = (
            select(Submission)
            .where(
                or_(
                    Submission.submitter_person_id == person_id,
                    Submission.id.in_(participant_ids),
                )
            )
            .order_by(Submission.created_at.desc())
        )
        return list(self.db.scalars(stmt))

    def get(self, submission_id: str) -> Submission | None:
        return self.db.get(Submission, submission_id)

    def create(self, data: dict) -> Submission:
        submission = Submission(**data)
        self.db.add(submission)
        self.db.flush()
        return submission

    def update(self, submission_id: str, patch: dict) -> Submission | None:
        submission = self.get(submission_id)
        if submission is None:
            return None
        for key, value in patch.items():
            setattr(submission, key, value)
        self.db.flush()
        return submission

    def count_submitted_by_form(self, form_id: str, person_id: str) -> int:
        stmt = (
            select(func.count())
            .select_from(Submission)
            .where(
                Submission.form_id == form_id,
                Submission.submitter_person_id == person_id,
                Submission.status.in_(("submitted", "pending_review", "accept_queue", "decline_queue", "accepted")),
            )
        )
        return self.db.scalar(stmt) or 0


class SqlAlchemySubmissionTrackRepository(SubmissionTrackRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_for_submission(self, submission_id: str) -> list[SubmissionTrack]:
        stmt = (
            select(SubmissionTrack)
            .where(SubmissionTrack.submission_id == submission_id)
            .order_by(SubmissionTrack.sort_order.asc())
        )
        return list(self.db.scalars(stmt))

    def list_track_ids_by_event(self, submission_ids: list[str]) -> dict[str, list[str]]:
        """Batched lookup so a list view does not issue one query per row."""
        if not submission_ids:
            return {}
        stmt = (
            select(SubmissionTrack)
            .where(SubmissionTrack.submission_id.in_(submission_ids))
            .order_by(SubmissionTrack.sort_order.asc())
        )
        grouped: dict[str, list[str]] = {}
        for row in self.db.scalars(stmt):
            grouped.setdefault(row.submission_id, []).append(row.track_id)
        return grouped

    def set_for_submission(self, submission_id: str, track_ids: list[str]) -> None:
        stmt = select(SubmissionTrack).where(SubmissionTrack.submission_id == submission_id)
        for row in self.db.scalars(stmt):
            self.db.delete(row)
        self.db.flush()
        for idx, track_id in enumerate(track_ids):
            self.db.add(SubmissionTrack(submission_id=submission_id, track_id=track_id, sort_order=idx))
        self.db.flush()


class SqlAlchemySubmissionParticipantRepository(SubmissionParticipantRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_for_submission(self, submission_id: str) -> list[SubmissionParticipant]:
        stmt = (
            select(SubmissionParticipant)
            .where(SubmissionParticipant.submission_id == submission_id)
            .order_by(SubmissionParticipant.sort_order.asc())
        )
        return list(self.db.scalars(stmt))

    def create(self, submission_id: str, data: dict) -> SubmissionParticipant:
        participant = SubmissionParticipant(submission_id=submission_id, **data)
        self.db.add(participant)
        self.db.flush()
        return participant

    def delete_for_submission(self, submission_id: str) -> None:
        stmt = select(SubmissionParticipant).where(SubmissionParticipant.submission_id == submission_id)
        for participant in self.db.scalars(stmt):
            self.db.delete(participant)
        self.db.flush()
