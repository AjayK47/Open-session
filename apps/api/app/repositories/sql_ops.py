from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.models.comms import Communication, CommunicationAutomation, EmailTemplate
from app.models.evaluation import EvaluationPlan, Review, ReviewAssignment
from app.models.files import File, FileComment
from app.models.people_ops import EventPerson, PersonNote
from app.models.portal import FieldDefinition, FileRequest, FileRequestUpload, PortalForm, PortalResource
from app.models.schedule import ProgramSession, SessionParticipant
from app.models.tasks import TaskAssignment, TaskTemplate
from app.models.views import SavedView
from app.repositories.ops import (
    AutomationRepository,
    CommunicationRepository,
    EmailTemplateRepository,
    EvaluationPlanRepository,
    EventPersonRepository,
    FieldDefinitionRepository,
    FileCommentRepository,
    FileRepository,
    FileRequestRepository,
    FileRequestUploadRepository,
    PersonNoteRepository,
    PortalFormRepository,
    PortalResourceRepository,
    ReviewAssignmentRepository,
    ReviewRepository,
    SavedViewRepository,
    SessionParticipantRepository,
    SessionRepository,
    TaskAssignmentRepository,
    TaskTemplateRepository,
)


class SqlEvaluationPlanRepository(EvaluationPlanRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_event(self, event_id: str) -> list[EvaluationPlan]:
        stmt = (
            select(EvaluationPlan).where(EvaluationPlan.event_id == event_id).order_by(EvaluationPlan.created_at.desc())
        )
        return list(self.db.scalars(stmt))

    def get(self, plan_id: str) -> EvaluationPlan | None:
        return self.db.get(EvaluationPlan, plan_id)

    def create(self, event_id: str, data: dict) -> EvaluationPlan:
        plan = EvaluationPlan(event_id=event_id, **data)
        self.db.add(plan)
        self.db.flush()
        return plan

    def update(self, plan_id: str, patch: dict) -> EvaluationPlan | None:
        plan = self.get(plan_id)
        if plan is None:
            return None
        for k, v in patch.items():
            setattr(plan, k, v)
        self.db.flush()
        return plan


class SqlReviewAssignmentRepository(ReviewAssignmentRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_for_reviewer(self, reviewer_person_id: str) -> list[ReviewAssignment]:
        stmt = (
            select(ReviewAssignment)
            .where(ReviewAssignment.reviewer_person_id == reviewer_person_id)
            .order_by(ReviewAssignment.assigned_at.desc())
        )
        return list(self.db.scalars(stmt))

    def list_by_submission(self, submission_id: str) -> list[ReviewAssignment]:
        stmt = (
            select(ReviewAssignment)
            .where(ReviewAssignment.submission_id == submission_id)
            .order_by(ReviewAssignment.assigned_at.asc())
        )
        return list(self.db.scalars(stmt))

    def list_by_plan(self, plan_id: str) -> list[ReviewAssignment]:
        stmt = (
            select(ReviewAssignment)
            .where(ReviewAssignment.evaluation_plan_id == plan_id)
            .order_by(ReviewAssignment.assigned_at.asc())
        )
        return list(self.db.scalars(stmt))

    def get(self, assignment_id: str) -> ReviewAssignment | None:
        return self.db.get(ReviewAssignment, assignment_id)

    def get_for(
        self, submission_id: str, reviewer_person_id: str, plan_id: str | None = None
    ) -> ReviewAssignment | None:
        stmt = select(ReviewAssignment).where(
            ReviewAssignment.submission_id == submission_id,
            ReviewAssignment.reviewer_person_id == reviewer_person_id,
        )
        if plan_id:
            stmt = stmt.where(ReviewAssignment.evaluation_plan_id == plan_id)
        return self.db.scalar(stmt)

    def create(self, data: dict) -> ReviewAssignment:
        assignment = ReviewAssignment(**data)
        self.db.add(assignment)
        self.db.flush()
        return assignment

    def update(self, assignment_id: str, patch: dict) -> ReviewAssignment | None:
        assignment = self.get(assignment_id)
        if assignment is None:
            return None
        for k, v in patch.items():
            setattr(assignment, k, v)
        self.db.flush()
        return assignment

    def count_by_plan(self, plan_id: str) -> int:
        return (
            self.db.scalar(
                select(func.count()).select_from(ReviewAssignment).where(ReviewAssignment.evaluation_plan_id == plan_id)
            )
            or 0
        )

    def count_completed_by_plan(self, plan_id: str) -> int:
        return (
            self.db.scalar(
                select(func.count())
                .select_from(ReviewAssignment)
                .where(ReviewAssignment.evaluation_plan_id == plan_id, ReviewAssignment.status == "completed")
            )
            or 0
        )

    def count_for_submission(self, submission_id: str) -> int:
        return (
            self.db.scalar(
                select(func.count())
                .select_from(ReviewAssignment)
                .where(ReviewAssignment.submission_id == submission_id)
            )
            or 0
        )


class SqlReviewRepository(ReviewRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_by_assignment(self, assignment_id: str) -> Review | None:
        return self.db.scalar(select(Review).where(Review.assignment_id == assignment_id))

    def create(self, data: dict) -> Review:
        review = Review(**data)
        self.db.add(review)
        self.db.flush()
        return review

    def update(self, review_id: str, patch: dict) -> Review | None:
        review = self.db.get(Review, review_id)
        if review is None:
            return None
        for k, v in patch.items():
            setattr(review, k, v)
        self.db.flush()
        return review


class SqlSessionRepository(SessionRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_event(self, event_id: str, filters: dict | None = None) -> list[ProgramSession]:
        stmt = select(ProgramSession).where(ProgramSession.event_id == event_id)
        if filters:
            if filters.get("status"):
                stmt = stmt.where(ProgramSession.status == filters["status"])
            if filters.get("track_id"):
                stmt = stmt.where(ProgramSession.track_id == filters["track_id"])
            if filters.get("room_id"):
                stmt = stmt.where(ProgramSession.room_id == filters["room_id"])
            if filters.get("format_id"):
                stmt = stmt.where(ProgramSession.format_id == filters["format_id"])
            if filters.get("unscheduled"):
                stmt = stmt.where(ProgramSession.starts_at.is_(None))
        stmt = stmt.order_by(ProgramSession.starts_at.asc(), ProgramSession.created_at.asc())
        return list(self.db.scalars(stmt))

    def get(self, session_id: str) -> ProgramSession | None:
        return self.db.get(ProgramSession, session_id)

    def get_by_submission(self, submission_id: str) -> ProgramSession | None:
        return self.db.scalar(select(ProgramSession).where(ProgramSession.source_submission_id == submission_id))

    def create(self, data: dict) -> ProgramSession:
        session = ProgramSession(**data)
        self.db.add(session)
        self.db.flush()
        return session

    def update(self, session_id: str, patch: dict) -> ProgramSession | None:
        session = self.get(session_id)
        if session is None:
            return None
        for k, v in patch.items():
            setattr(session, k, v)
        self.db.flush()
        return session

    def list_scheduled(self, event_id: str) -> list[ProgramSession]:
        stmt = (
            select(ProgramSession)
            .where(ProgramSession.event_id == event_id, ProgramSession.starts_at.is_not(None))
            .order_by(ProgramSession.starts_at.asc())
        )
        return list(self.db.scalars(stmt))


class SqlSessionParticipantRepository(SessionParticipantRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_for_session(self, session_id: str) -> list[SessionParticipant]:
        stmt = (
            select(SessionParticipant)
            .where(SessionParticipant.session_id == session_id)
            .order_by(SessionParticipant.sort_order.asc())
        )
        return list(self.db.scalars(stmt))

    def list_for_person(self, person_id: str) -> list[SessionParticipant]:
        stmt = select(SessionParticipant).where(SessionParticipant.person_id == person_id)
        return list(self.db.scalars(stmt))

    def create(self, session_id: str, data: dict) -> SessionParticipant:
        participant = SessionParticipant(session_id=session_id, **data)
        self.db.add(participant)
        self.db.flush()
        return participant

    def delete_for_session(self, session_id: str) -> None:
        for participant in self.db.scalars(
            select(SessionParticipant).where(SessionParticipant.session_id == session_id)
        ):
            self.db.delete(participant)
        self.db.flush()


class SqlTaskTemplateRepository(TaskTemplateRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_event(self, event_id: str) -> list[TaskTemplate]:
        stmt = select(TaskTemplate).where(TaskTemplate.event_id == event_id).order_by(TaskTemplate.created_at.asc())
        return list(self.db.scalars(stmt))

    def get(self, template_id: str) -> TaskTemplate | None:
        return self.db.get(TaskTemplate, template_id)

    def create(self, event_id: str, data: dict) -> TaskTemplate:
        template = TaskTemplate(event_id=event_id, **data)
        self.db.add(template)
        self.db.flush()
        return template

    def update(self, template_id: str, patch: dict) -> TaskTemplate | None:
        template = self.get(template_id)
        if template is None:
            return None
        for k, v in patch.items():
            setattr(template, k, v)
        self.db.flush()
        return template


class SqlTaskAssignmentRepository(TaskAssignmentRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_event(self, event_id: str, filters: dict | None = None) -> list[TaskAssignment]:
        stmt = select(TaskAssignment).where(TaskAssignment.event_id == event_id)
        if filters:
            if filters.get("status"):
                stmt = stmt.where(TaskAssignment.status == filters["status"])
            if filters.get("person_id"):
                stmt = stmt.where(TaskAssignment.person_id == filters["person_id"])
            if filters.get("template_id"):
                stmt = stmt.where(TaskAssignment.template_id == filters["template_id"])
            if filters.get("overdue"):
                stmt = stmt.where(
                    TaskAssignment.status == "open",
                    TaskAssignment.due_at.is_not(None),
                    TaskAssignment.due_at < utcnow(),
                )
        stmt = stmt.order_by(TaskAssignment.created_at.desc())
        return list(self.db.scalars(stmt))

    def list_for_person(self, person_id: str) -> list[TaskAssignment]:
        stmt = (
            select(TaskAssignment)
            .where(TaskAssignment.person_id == person_id)
            .order_by(TaskAssignment.created_at.desc())
        )
        return list(self.db.scalars(stmt))

    def get(self, assignment_id: str) -> TaskAssignment | None:
        return self.db.get(TaskAssignment, assignment_id)

    def create(self, data: dict) -> TaskAssignment:
        assignment = TaskAssignment(**data)
        self.db.add(assignment)
        self.db.flush()
        return assignment

    def update(self, assignment_id: str, patch: dict) -> TaskAssignment | None:
        assignment = self.get(assignment_id)
        if assignment is None:
            return None
        for k, v in patch.items():
            setattr(assignment, k, v)
        self.db.flush()
        return assignment

    def count_open_by_event(self, event_id: str) -> int:
        return (
            self.db.scalar(
                select(func.count())
                .select_from(TaskAssignment)
                .where(TaskAssignment.event_id == event_id, TaskAssignment.status == "open")
            )
            or 0
        )

    def count_open_overdue(self, event_id: str, now: datetime) -> int:
        return (
            self.db.scalar(
                select(func.count())
                .select_from(TaskAssignment)
                .where(
                    TaskAssignment.event_id == event_id,
                    TaskAssignment.status == "open",
                    TaskAssignment.due_at.is_not(None),
                    TaskAssignment.due_at < now,
                )
            )
            or 0
        )

    def count_completed_by_person(self, person_id: str) -> int:
        return (
            self.db.scalar(
                select(func.count())
                .select_from(TaskAssignment)
                .where(TaskAssignment.person_id == person_id, TaskAssignment.status == "completed")
            )
            or 0
        )

    def reminder_candidates(
        self, event_id: str, due_before: datetime, reminder_offset_hours: int
    ) -> list[TaskAssignment]:
        """Open tasks due within the reminder window OR already overdue."""
        stmt = (
            select(TaskAssignment)
            .where(
                TaskAssignment.event_id == event_id,
                TaskAssignment.status == "open",
                TaskAssignment.due_at.is_not(None),
                TaskAssignment.due_at <= due_before,
            )
            .order_by(TaskAssignment.due_at.asc())
        )
        return list(self.db.scalars(stmt))


class SqlEventPersonRepository(EventPersonRepository):
    def __init__(self, db: Session):
        self.db = db

    def get(self, event_id: str, person_id: str) -> EventPerson | None:
        return self.db.scalar(
            select(EventPerson).where(EventPerson.event_id == event_id, EventPerson.person_id == person_id)
        )

    def upsert(self, event_id: str, person_id: str, data: dict) -> EventPerson:
        ep = self.get(event_id, person_id)
        if ep is None:
            ep = EventPerson(event_id=event_id, person_id=person_id, **data)
            self.db.add(ep)
            self.db.flush()
            return ep
        for k, v in data.items():
            setattr(ep, k, v)
        self.db.flush()
        return ep

    def list_by_event(self, event_id: str) -> list[EventPerson]:
        stmt = select(EventPerson).where(EventPerson.event_id == event_id).order_by(EventPerson.created_at.asc())
        return list(self.db.scalars(stmt))

    def list_speakers(self, event_id: str, speaker_status: str | None = None) -> list[EventPerson]:
        """Everyone attached to the event, optionally narrowed by status.

        This used to hard-filter to "accepted", which meant an imported or
        manually added speaker simply never appeared on the roster — and made
        the status filter meaningless, since only one status was reachable.
        """
        stmt = select(EventPerson).where(EventPerson.event_id == event_id)
        if speaker_status:
            stmt = stmt.where(EventPerson.speaker_status == speaker_status)
        return list(self.db.scalars(stmt.order_by(EventPerson.created_at.asc())))

    def list_for_person(self, person_id: str) -> list[EventPerson]:
        stmt = select(EventPerson).where(EventPerson.person_id == person_id).order_by(EventPerson.created_at.asc())
        return list(self.db.scalars(stmt))


class SqlFileRepository(FileRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_event(self, event_id: str, file_type: str | None = None) -> list[File]:
        stmt = select(File).where(File.event_id == event_id)
        if file_type:
            stmt = stmt.where(File.file_type == file_type)
        stmt = stmt.order_by(File.uploaded_at.desc())
        return list(self.db.scalars(stmt))

    def list_for_person(self, person_id: str) -> list[File]:
        stmt = select(File).where(File.person_id == person_id).order_by(File.uploaded_at.desc())
        return list(self.db.scalars(stmt))

    def find_previous_version(self, file: File) -> File | None:
        """The current latest upload for the same deliverable.

        Matched on whichever target the file is attached to — task assignment,
        file request, session or submission — plus the file type. A headshot
        falls back to matching on the person, since it has no other target.
        """
        stmt = select(File).where(
            File.event_id == file.event_id,
            File.file_type == file.file_type,
            File.id != file.id,
            File.is_latest.is_(True),
        )
        if file.task_assignment_id:
            stmt = stmt.where(File.task_assignment_id == file.task_assignment_id)
        elif file.file_request_id:
            stmt = stmt.where(File.file_request_id == file.file_request_id)
            if file.person_id:
                stmt = stmt.where(File.person_id == file.person_id)
        elif file.session_id:
            stmt = stmt.where(File.session_id == file.session_id)
        elif file.submission_id:
            stmt = stmt.where(File.submission_id == file.submission_id)
        elif file.person_id:
            stmt = stmt.where(File.person_id == file.person_id)
        else:
            return None
        return self.db.scalar(stmt.order_by(File.version.desc()))

    def list_versions(self, file_id: str) -> list[File]:
        """The whole chain for a file, newest first."""
        head = self.db.get(File, file_id)
        if head is None:
            return []
        chain = [head]
        cursor = head
        while cursor.replaces_file_id:
            previous = self.db.get(File, cursor.replaces_file_id)
            if previous is None:
                break
            chain.append(previous)
            cursor = previous
        return chain

    def get(self, file_id: str) -> File | None:
        return self.db.get(File, file_id)

    def create(self, data: dict) -> File:
        file = File(**data)
        self.db.add(file)
        self.db.flush()
        return file

    def delete(self, file_id: str) -> None:
        file = self.get(file_id)
        if file is not None:
            self.db.delete(file)
        self.db.flush()


class SqlEmailTemplateRepository(EmailTemplateRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_event(self, event_id: str) -> list[EmailTemplate]:
        stmt = select(EmailTemplate).where(EmailTemplate.event_id == event_id).order_by(EmailTemplate.created_at.asc())
        return list(self.db.scalars(stmt))

    def get(self, template_id: str) -> EmailTemplate | None:
        return self.db.get(EmailTemplate, template_id)

    def get_by_type(self, event_id: str, type: str) -> EmailTemplate | None:
        return self.db.scalar(
            select(EmailTemplate).where(EmailTemplate.event_id == event_id, EmailTemplate.type == type)
        )

    def create(self, event_id: str, data: dict) -> EmailTemplate:
        template = EmailTemplate(event_id=event_id, **data)
        self.db.add(template)
        self.db.flush()
        return template

    def update(self, template_id: str, patch: dict) -> EmailTemplate | None:
        template = self.get(template_id)
        if template is None:
            return None
        for k, v in patch.items():
            setattr(template, k, v)
        self.db.flush()
        return template


class SqlAutomationRepository(AutomationRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_event(self, event_id: str) -> list[CommunicationAutomation]:
        stmt = (
            select(CommunicationAutomation)
            .where(CommunicationAutomation.event_id == event_id)
            .order_by(CommunicationAutomation.created_at.asc())
        )
        return list(self.db.scalars(stmt))

    def list_enabled(self, event_id: str, trigger_type: str) -> list[CommunicationAutomation]:
        stmt = (
            select(CommunicationAutomation)
            .where(
                CommunicationAutomation.event_id == event_id,
                CommunicationAutomation.enabled.is_(True),
                CommunicationAutomation.trigger_type == trigger_type,
            )
            .order_by(CommunicationAutomation.created_at.asc())
        )
        return list(self.db.scalars(stmt))

    def get(self, automation_id: str) -> CommunicationAutomation | None:
        return self.db.get(CommunicationAutomation, automation_id)

    def create(self, event_id: str, data: dict) -> CommunicationAutomation:
        automation = CommunicationAutomation(event_id=event_id, **data)
        self.db.add(automation)
        self.db.flush()
        return automation

    def update(self, automation_id: str, patch: dict) -> CommunicationAutomation | None:
        automation = self.get(automation_id)
        if automation is None:
            return None
        for k, v in patch.items():
            setattr(automation, k, v)
        self.db.flush()
        return automation


class SqlCommunicationRepository(CommunicationRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_event(self, event_id: str, filters: dict | None = None) -> list[Communication]:
        stmt = select(Communication).where(Communication.event_id == event_id)
        if filters:
            if filters.get("status"):
                stmt = stmt.where(Communication.status == filters["status"])
            if filters.get("related_submission_id"):
                stmt = stmt.where(Communication.related_submission_id == filters["related_submission_id"])
        stmt = stmt.order_by(Communication.created_at.desc())
        return list(self.db.scalars(stmt))

    def list_for_person(self, person_id: str) -> list[Communication]:
        stmt = (
            select(Communication)
            .where(Communication.recipient_person_id == person_id)
            .order_by(Communication.created_at.desc())
        )
        return list(self.db.scalars(stmt))

    def get(self, communication_id: str) -> Communication | None:
        return self.db.get(Communication, communication_id)

    def create(self, data: dict) -> Communication:
        communication = Communication(**data)
        self.db.add(communication)
        self.db.flush()
        return communication

    def update(self, communication_id: str, patch: dict) -> Communication | None:
        communication = self.get(communication_id)
        if communication is None:
            return None
        for k, v in patch.items():
            setattr(communication, k, v)
        self.db.flush()
        return communication


class SqlSavedViewRepository(SavedViewRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_for_owner(self, event_id: str, owner_person_id: str, resource_type: str | None = None) -> list[SavedView]:
        stmt = select(SavedView).where(SavedView.event_id == event_id, SavedView.owner_person_id == owner_person_id)
        if resource_type:
            stmt = stmt.where(SavedView.resource_type == resource_type)
        stmt = stmt.order_by(SavedView.created_at.asc())
        return list(self.db.scalars(stmt))

    def get(self, view_id: str) -> SavedView | None:
        return self.db.get(SavedView, view_id)

    def create(self, data: dict) -> SavedView:
        view = SavedView(**data)
        self.db.add(view)
        self.db.flush()
        return view

    def update(self, view_id: str, patch: dict) -> SavedView | None:
        view = self.get(view_id)
        if view is None:
            return None
        for k, v in patch.items():
            setattr(view, k, v)
        self.db.flush()
        return view

    def delete(self, view_id: str) -> None:
        view = self.get(view_id)
        if view is not None:
            self.db.delete(view)
        self.db.flush()


class SqlFieldDefinitionRepository(FieldDefinitionRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_event(self, event_id: str) -> list[FieldDefinition]:
        return list(
            self.db.scalars(
                select(FieldDefinition)
                .where(FieldDefinition.event_id == event_id)
                .order_by(FieldDefinition.created_at.asc())
            )
        )

    def get(self, field_id: str) -> FieldDefinition | None:
        return self.db.get(FieldDefinition, field_id)

    def create(self, event_id: str, data: dict) -> FieldDefinition:
        field = FieldDefinition(event_id=event_id, **data)
        self.db.add(field)
        self.db.flush()
        return field

    def update(self, field_id: str, patch: dict) -> FieldDefinition | None:
        field = self.get(field_id)
        if field is None:
            return None
        for key, value in patch.items():
            setattr(field, key, value)
        self.db.flush()
        return field

    def delete(self, field_id: str) -> None:
        field = self.get(field_id)
        if field is not None:
            self.db.delete(field)
        self.db.flush()


class SqlPortalFormRepository(PortalFormRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_event(self, event_id: str) -> list[PortalForm]:
        return list(
            self.db.scalars(
                select(PortalForm).where(PortalForm.event_id == event_id).order_by(PortalForm.created_at.asc())
            )
        )

    def get(self, form_id: str) -> PortalForm | None:
        return self.db.get(PortalForm, form_id)

    def create(self, event_id: str, data: dict) -> PortalForm:
        form = PortalForm(event_id=event_id, **data)
        self.db.add(form)
        self.db.flush()
        return form

    def update(self, form_id: str, patch: dict) -> PortalForm | None:
        form = self.get(form_id)
        if form is None:
            return None
        for key, value in patch.items():
            setattr(form, key, value)
        self.db.flush()
        return form

    def delete(self, form_id: str) -> None:
        form = self.get(form_id)
        if form is not None:
            self.db.delete(form)
        self.db.flush()


class SqlPortalResourceRepository(PortalResourceRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_event(self, event_id: str, *, published_only: bool = False) -> list[PortalResource]:
        stmt = select(PortalResource).where(PortalResource.event_id == event_id)
        if published_only:
            stmt = stmt.where(PortalResource.status == "published")
        stmt = stmt.order_by(PortalResource.sort_order.asc(), PortalResource.created_at.asc())
        return list(self.db.scalars(stmt))

    def get(self, resource_id: str) -> PortalResource | None:
        return self.db.get(PortalResource, resource_id)

    def create(self, event_id: str, data: dict) -> PortalResource:
        resource = PortalResource(event_id=event_id, **data)
        self.db.add(resource)
        self.db.flush()
        return resource

    def update(self, resource_id: str, patch: dict) -> PortalResource | None:
        resource = self.get(resource_id)
        if resource is None:
            return None
        for key, value in patch.items():
            setattr(resource, key, value)
        self.db.flush()
        return resource

    def delete(self, resource_id: str) -> None:
        resource = self.get(resource_id)
        if resource is not None:
            self.db.delete(resource)
        self.db.flush()


class SqlFileCommentRepository(FileCommentRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_for_file(self, file_id: str) -> list[FileComment]:
        stmt = select(FileComment).where(FileComment.file_id == file_id).order_by(FileComment.created_at.asc())
        return list(self.db.scalars(stmt))

    def create(self, data: dict) -> FileComment:
        comment = FileComment(**data)
        self.db.add(comment)
        self.db.flush()
        return comment


class SqlFileRequestRepository(FileRequestRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_by_event(self, event_id: str) -> list[FileRequest]:
        return list(
            self.db.scalars(
                select(FileRequest).where(FileRequest.event_id == event_id).order_by(FileRequest.created_at.asc())
            )
        )

    def get(self, request_id: str) -> FileRequest | None:
        return self.db.get(FileRequest, request_id)

    def create(self, event_id: str, data: dict) -> FileRequest:
        request = FileRequest(event_id=event_id, **data)
        self.db.add(request)
        self.db.flush()
        return request

    def update(self, request_id: str, patch: dict) -> FileRequest | None:
        request = self.get(request_id)
        if request is None:
            return None
        for key, value in patch.items():
            setattr(request, key, value)
        self.db.flush()
        return request

    def delete(self, request_id: str) -> None:
        request = self.get(request_id)
        if request is not None:
            self.db.delete(request)
        self.db.flush()


class SqlFileRequestUploadRepository(FileRequestUploadRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_for_request(self, request_id: str) -> list[FileRequestUpload]:
        return list(
            self.db.scalars(
                select(FileRequestUpload)
                .where(FileRequestUpload.file_request_id == request_id)
                .order_by(FileRequestUpload.uploaded_at.desc())
            )
        )

    def list_for_person(self, person_id: str) -> list[FileRequestUpload]:
        return list(
            self.db.scalars(
                select(FileRequestUpload)
                .where(FileRequestUpload.person_id == person_id)
                .order_by(FileRequestUpload.uploaded_at.desc())
            )
        )

    def create(self, data: dict) -> FileRequestUpload:
        upload = FileRequestUpload(**data)
        self.db.add(upload)
        self.db.flush()
        return upload


class SqlPersonNoteRepository(PersonNoteRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_for_person(self, person_id: str) -> list[PersonNote]:
        return list(
            self.db.scalars(
                select(PersonNote).where(PersonNote.person_id == person_id).order_by(PersonNote.created_at.desc())
            )
        )

    def create(self, data: dict) -> PersonNote:
        note = PersonNote(**data)
        self.db.add(note)
        self.db.flush()
        return note
