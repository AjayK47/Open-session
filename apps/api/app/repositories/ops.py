from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any

from app.models.comms import Communication, CommunicationAutomation, EmailTemplate
from app.models.evaluation import EvaluationPlan, Review, ReviewAssignment
from app.models.files import File, FileComment
from app.models.people_ops import EventPerson
from app.models.portal import FieldDefinition, FileRequest, FileRequestUpload, PortalForm, PortalResource
from app.models.schedule import ProgramSession, SessionParticipant
from app.models.tasks import TaskAssignment, TaskTemplate
from app.models.views import SavedView

SESSION_CLS = ProgramSession


class EvaluationPlanRepository(ABC):
    @abstractmethod
    def list_by_event(self, event_id: str) -> list[EvaluationPlan]: ...

    @abstractmethod
    def get(self, plan_id: str) -> EvaluationPlan | None: ...

    @abstractmethod
    def create(self, event_id: str, data: dict) -> EvaluationPlan: ...

    @abstractmethod
    def update(self, plan_id: str, patch: dict) -> EvaluationPlan | None: ...


class ReviewAssignmentRepository(ABC):
    @abstractmethod
    def list_for_reviewer(self, reviewer_person_id: str) -> list[ReviewAssignment]: ...

    @abstractmethod
    def list_by_submission(self, submission_id: str) -> list[ReviewAssignment]: ...

    @abstractmethod
    def list_by_plan(self, plan_id: str) -> list[ReviewAssignment]: ...

    @abstractmethod
    def get(self, assignment_id: str) -> ReviewAssignment | None: ...

    @abstractmethod
    def get_for(
        self, submission_id: str, reviewer_person_id: str, plan_id: str | None = None
    ) -> ReviewAssignment | None: ...

    @abstractmethod
    def create(self, data: dict) -> ReviewAssignment: ...

    @abstractmethod
    def update(self, assignment_id: str, patch: dict) -> ReviewAssignment | None: ...

    @abstractmethod
    def count_by_plan(self, plan_id: str) -> int: ...

    @abstractmethod
    def count_completed_by_plan(self, plan_id: str) -> int: ...

    @abstractmethod
    def count_for_submission(self, submission_id: str) -> int: ...


class ReviewRepository(ABC):
    @abstractmethod
    def get_by_assignment(self, assignment_id: str) -> Review | None: ...

    @abstractmethod
    def create(self, data: dict) -> Review: ...

    @abstractmethod
    def update(self, review_id: str, patch: dict) -> Review | None: ...


class SessionRepository(ABC):
    @abstractmethod
    def list_by_event(self, event_id: str, filters: dict[str, Any] | None = None) -> list[ProgramSession]: ...

    @abstractmethod
    def get(self, session_id: str) -> ProgramSession | None: ...

    @abstractmethod
    def get_by_submission(self, submission_id: str) -> ProgramSession | None: ...

    @abstractmethod
    def create(self, data: dict) -> ProgramSession: ...

    @abstractmethod
    def update(self, session_id: str, patch: dict) -> ProgramSession | None: ...

    @abstractmethod
    def list_scheduled(self, event_id: str) -> list[ProgramSession]: ...


class SessionParticipantRepository(ABC):
    @abstractmethod
    def list_for_session(self, session_id: str) -> list[SessionParticipant]: ...

    @abstractmethod
    def list_for_person(self, person_id: str) -> list[SessionParticipant]: ...

    @abstractmethod
    def create(self, session_id: str, data: dict) -> SessionParticipant: ...

    @abstractmethod
    def delete_for_session(self, session_id: str) -> None: ...


class TaskTemplateRepository(ABC):
    @abstractmethod
    def list_by_event(self, event_id: str) -> list[TaskTemplate]: ...

    @abstractmethod
    def get(self, template_id: str) -> TaskTemplate | None: ...

    @abstractmethod
    def create(self, event_id: str, data: dict) -> TaskTemplate: ...

    @abstractmethod
    def update(self, template_id: str, patch: dict) -> TaskTemplate | None: ...


class TaskAssignmentRepository(ABC):
    @abstractmethod
    def list_by_event(self, event_id: str, filters: dict[str, Any] | None = None) -> list[TaskAssignment]: ...

    @abstractmethod
    def list_for_person(self, person_id: str) -> list[TaskAssignment]: ...

    @abstractmethod
    def get(self, assignment_id: str) -> TaskAssignment | None: ...

    @abstractmethod
    def create(self, data: dict) -> TaskAssignment: ...

    @abstractmethod
    def update(self, assignment_id: str, patch: dict) -> TaskAssignment | None: ...

    @abstractmethod
    def count_open_by_event(self, event_id: str) -> int: ...

    @abstractmethod
    def count_open_overdue(self, event_id: str, now: datetime) -> int: ...

    @abstractmethod
    def count_completed_by_person(self, person_id: str) -> int: ...

    @abstractmethod
    def reminder_candidates(
        self, event_id: str, due_before: datetime, reminder_offset_hours: int
    ) -> list[TaskAssignment]: ...


class EventPersonRepository(ABC):
    @abstractmethod
    def get(self, event_id: str, person_id: str) -> EventPerson | None: ...

    @abstractmethod
    def upsert(self, event_id: str, person_id: str, data: dict) -> EventPerson: ...

    @abstractmethod
    def list_by_event(self, event_id: str) -> list[EventPerson]: ...

    @abstractmethod
    def list_speakers(self, event_id: str, speaker_status: str | None = None) -> list[EventPerson]: ...

    @abstractmethod
    def list_for_person(self, person_id: str) -> list[EventPerson]: ...


class FileRepository(ABC):
    @abstractmethod
    def list_by_event(self, event_id: str, file_type: str | None = None) -> list[File]: ...

    @abstractmethod
    def list_for_person(self, person_id: str) -> list[File]: ...

    # The current latest file for the same deliverable, if any.
    @abstractmethod
    def find_previous_version(self, file: File) -> File | None: ...

    @abstractmethod
    def list_versions(self, file_id: str) -> list[File]: ...

    @abstractmethod
    def get(self, file_id: str) -> File | None: ...

    @abstractmethod
    def create(self, data: dict) -> File: ...

    @abstractmethod
    def delete(self, file_id: str) -> None: ...


class FileCommentRepository(ABC):
    @abstractmethod
    def list_for_file(self, file_id: str) -> list[FileComment]: ...

    @abstractmethod
    def create(self, data: dict) -> FileComment: ...


class EmailTemplateRepository(ABC):
    @abstractmethod
    def list_by_event(self, event_id: str) -> list[EmailTemplate]: ...

    @abstractmethod
    def get(self, template_id: str) -> EmailTemplate | None: ...

    @abstractmethod
    def get_by_type(self, event_id: str, type: str) -> EmailTemplate | None: ...

    @abstractmethod
    def create(self, event_id: str, data: dict) -> EmailTemplate: ...

    @abstractmethod
    def update(self, template_id: str, patch: dict) -> EmailTemplate | None: ...


class AutomationRepository(ABC):
    @abstractmethod
    def list_by_event(self, event_id: str) -> list[CommunicationAutomation]: ...

    @abstractmethod
    def list_enabled(self, event_id: str, trigger_type: str) -> list[CommunicationAutomation]: ...

    @abstractmethod
    def get(self, automation_id: str) -> CommunicationAutomation | None: ...

    @abstractmethod
    def create(self, event_id: str, data: dict) -> CommunicationAutomation: ...

    @abstractmethod
    def update(self, automation_id: str, patch: dict) -> CommunicationAutomation | None: ...


class CommunicationRepository(ABC):
    @abstractmethod
    def list_by_event(self, event_id: str, filters: dict[str, Any] | None = None) -> list[Communication]: ...

    @abstractmethod
    def list_for_person(self, person_id: str) -> list[Communication]: ...

    @abstractmethod
    def get(self, communication_id: str) -> Communication | None: ...

    @abstractmethod
    def create(self, data: dict) -> Communication: ...

    @abstractmethod
    def update(self, communication_id: str, patch: dict) -> Communication | None: ...


class SavedViewRepository(ABC):
    @abstractmethod
    def list_for_owner(
        self, event_id: str, owner_person_id: str, resource_type: str | None = None
    ) -> list[SavedView]: ...

    @abstractmethod
    def get(self, view_id: str) -> SavedView | None: ...

    @abstractmethod
    def create(self, data: dict) -> SavedView: ...

    @abstractmethod
    def update(self, view_id: str, patch: dict) -> SavedView | None: ...

    @abstractmethod
    def delete(self, view_id: str) -> None: ...


class FieldDefinitionRepository(ABC):
    @abstractmethod
    def list_by_event(self, event_id: str) -> list[FieldDefinition]: ...

    @abstractmethod
    def get(self, field_id: str) -> FieldDefinition | None: ...

    @abstractmethod
    def create(self, event_id: str, data: dict) -> FieldDefinition: ...

    @abstractmethod
    def update(self, field_id: str, patch: dict) -> FieldDefinition | None: ...

    @abstractmethod
    def delete(self, field_id: str) -> None: ...


class PortalFormRepository(ABC):
    @abstractmethod
    def list_by_event(self, event_id: str) -> list[PortalForm]: ...

    @abstractmethod
    def get(self, form_id: str) -> PortalForm | None: ...

    @abstractmethod
    def create(self, event_id: str, data: dict) -> PortalForm: ...

    @abstractmethod
    def update(self, form_id: str, patch: dict) -> PortalForm | None: ...

    @abstractmethod
    def delete(self, form_id: str) -> None: ...


class PortalResourceRepository(ABC):
    @abstractmethod
    def list_by_event(self, event_id: str, *, published_only: bool = False) -> list[PortalResource]: ...

    @abstractmethod
    def get(self, resource_id: str) -> PortalResource | None: ...

    @abstractmethod
    def create(self, event_id: str, data: dict) -> PortalResource: ...

    @abstractmethod
    def update(self, resource_id: str, patch: dict) -> PortalResource | None: ...

    @abstractmethod
    def delete(self, resource_id: str) -> None: ...


class FileRequestRepository(ABC):
    @abstractmethod
    def list_by_event(self, event_id: str) -> list[FileRequest]: ...

    @abstractmethod
    def get(self, request_id: str) -> FileRequest | None: ...

    @abstractmethod
    def create(self, event_id: str, data: dict) -> FileRequest: ...

    @abstractmethod
    def update(self, request_id: str, patch: dict) -> FileRequest | None: ...

    @abstractmethod
    def delete(self, request_id: str) -> None: ...


class FileRequestUploadRepository(ABC):
    @abstractmethod
    def list_for_request(self, request_id: str) -> list[FileRequestUpload]: ...

    @abstractmethod
    def list_for_person(self, person_id: str) -> list[FileRequestUpload]: ...

    @abstractmethod
    def create(self, data: dict) -> FileRequestUpload: ...
