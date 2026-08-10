from abc import ABC, abstractmethod
from typing import Any

from app.models.cfp import Submission, SubmissionForm, SubmissionParticipant, SubmissionTrack
from app.models.program import Event, Person, Room, SessionFormat, Tag, Track


class EventRepository(ABC):
    @abstractmethod
    def list_by_ids(self, event_ids: list[str]) -> list[Event]: ...

    @abstractmethod
    def list_by_organization(self, organization_id: str) -> list[Event]: ...

    @abstractmethod
    def get(self, event_id: str) -> Event | None: ...

    @abstractmethod
    def get_by_slug(self, slug: str) -> Event | None: ...

    @abstractmethod
    def list_published(self) -> list[Event]:
        """Events whose agenda has been published, soonest first.

        This is the only listing reachable without auth — it backs the bare
        /sessions, /agenda, … URLs, which have no slug to resolve from.
        """

    @abstractmethod
    def create(self, data: dict) -> Event: ...

    @abstractmethod
    def update(self, event_id: str, patch: dict) -> Event | None: ...

    @abstractmethod
    def count(self) -> int: ...

    @abstractmethod
    def allocate_submission_number(self, event_id: str) -> int: ...


class TrackRepository(ABC):
    @abstractmethod
    def list_by_event(self, event_id: str) -> list[Track]: ...

    @abstractmethod
    def get(self, track_id: str) -> Track | None: ...

    @abstractmethod
    def create(self, event_id: str, data: dict) -> Track: ...

    @abstractmethod
    def update(self, track_id: str, patch: dict) -> Track | None: ...


class RoomRepository(ABC):
    @abstractmethod
    def list_by_event(self, event_id: str) -> list[Room]: ...

    @abstractmethod
    def get(self, room_id: str) -> Room | None: ...

    @abstractmethod
    def create(self, event_id: str, data: dict) -> Room: ...

    @abstractmethod
    def update(self, room_id: str, patch: dict) -> Room | None: ...


class FormatRepository(ABC):
    @abstractmethod
    def list_by_event(self, event_id: str) -> list[SessionFormat]: ...

    @abstractmethod
    def get(self, format_id: str) -> SessionFormat | None: ...

    @abstractmethod
    def create(self, event_id: str, data: dict) -> SessionFormat: ...

    @abstractmethod
    def update(self, format_id: str, patch: dict) -> SessionFormat | None: ...


class TagRepository(ABC):
    @abstractmethod
    def list_by_event(self, event_id: str) -> list[Tag]: ...

    @abstractmethod
    def get(self, tag_id: str) -> Tag | None: ...

    @abstractmethod
    def create(self, event_id: str, data: dict) -> Tag: ...

    @abstractmethod
    def update(self, tag_id: str, patch: dict) -> Tag | None: ...


class PersonRepository(ABC):
    @abstractmethod
    def get(self, person_id: str) -> Person | None: ...

    @abstractmethod
    def get_by_email(self, email: str) -> Person | None: ...

    @abstractmethod
    def upsert_by_email(self, email: str, data: dict) -> Person: ...


class FormRepository(ABC):
    @abstractmethod
    def list_by_event(self, event_id: str) -> list[SubmissionForm]: ...

    @abstractmethod
    def get(self, form_id: str) -> SubmissionForm | None: ...

    @abstractmethod
    def get_by_slug(self, event_id: str, slug: str) -> SubmissionForm | None: ...

    @abstractmethod
    def create(self, event_id: str, data: dict) -> SubmissionForm: ...

    @abstractmethod
    def update(self, form_id: str, patch: dict) -> SubmissionForm | None: ...

    @abstractmethod
    def delete(self, form_id: str) -> bool: ...


class SubmissionRepository(ABC):
    @abstractmethod
    def list_by_event(self, event_id: str, filters: dict[str, Any] | None = None) -> list[Submission]: ...

    @abstractmethod
    def list_for_person(self, person_id: str) -> list[Submission]: ...

    # Submissions the person submitted *or* is listed on as a participant.
    #
    # This is the set the speaker portal shows, and it has to match what
    # `PATCH /me/submissions/{id}` accepts — that endpoint authorises
    # submitter-or-participant, so listing only the submitter's own rows hides
    # submissions the speaker is explicitly allowed to edit.
    @abstractmethod
    def list_involving_person(self, person_id: str) -> list[Submission]: ...

    @abstractmethod
    def get(self, submission_id: str) -> Submission | None: ...

    @abstractmethod
    def create(self, data: dict) -> Submission: ...

    @abstractmethod
    def update(self, submission_id: str, patch: dict) -> Submission | None: ...

    @abstractmethod
    def count_submitted_by_form(self, form_id: str, person_id: str) -> int: ...


class SubmissionTrackRepository(ABC):
    """Extra tracks beyond `Submission.track_id` (the primary one)."""

    @abstractmethod
    def list_for_submission(self, submission_id: str) -> list[SubmissionTrack]: ...

    @abstractmethod
    def list_track_ids_by_event(self, submission_ids: list[str]) -> dict[str, list[str]]: ...

    @abstractmethod
    def set_for_submission(self, submission_id: str, track_ids: list[str]) -> None: ...


class SubmissionParticipantRepository(ABC):
    @abstractmethod
    def list_for_submission(self, submission_id: str) -> list[SubmissionParticipant]: ...

    @abstractmethod
    def create(self, submission_id: str, data: dict) -> SubmissionParticipant: ...

    @abstractmethod
    def delete_for_submission(self, submission_id: str) -> None: ...
