from dataclasses import dataclass

from sqlalchemy.orm import Session

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
from app.repositories.sql import (
    SqlAlchemyEventRepository,
    SqlAlchemyFormatRepository,
    SqlAlchemyFormRepository,
    SqlAlchemyPersonRepository,
    SqlAlchemyRoomRepository,
    SqlAlchemySubmissionParticipantRepository,
    SqlAlchemySubmissionRepository,
    SqlAlchemySubmissionTrackRepository,
    SqlAlchemyTagRepository,
    SqlAlchemyTrackRepository,
)
from app.repositories.sql_ops import (
    SqlAutomationRepository,
    SqlCommunicationRepository,
    SqlEmailTemplateRepository,
    SqlEvaluationPlanRepository,
    SqlEventPersonRepository,
    SqlFieldDefinitionRepository,
    SqlFileCommentRepository,
    SqlFileRepository,
    SqlFileRequestRepository,
    SqlFileRequestUploadRepository,
    SqlPortalFormRepository,
    SqlPortalResourceRepository,
    SqlReviewAssignmentRepository,
    SqlReviewRepository,
    SqlSavedViewRepository,
    SqlSessionParticipantRepository,
    SqlSessionRepository,
    SqlTaskAssignmentRepository,
    SqlTaskTemplateRepository,
)


@dataclass(frozen=True)
class Repositories:
    events: EventRepository
    tracks: TrackRepository
    rooms: RoomRepository
    formats: FormatRepository
    tags: TagRepository
    people: PersonRepository
    forms: FormRepository
    submissions: SubmissionRepository
    submission_participants: SubmissionParticipantRepository
    submission_tracks: SubmissionTrackRepository
    evaluation_plans: EvaluationPlanRepository
    review_assignments: ReviewAssignmentRepository
    reviews: ReviewRepository
    sessions: SessionRepository
    session_participants: SessionParticipantRepository
    task_templates: TaskTemplateRepository
    task_assignments: TaskAssignmentRepository
    event_people: EventPersonRepository
    files: FileRepository
    file_comments: FileCommentRepository
    email_templates: EmailTemplateRepository
    automations: AutomationRepository
    communications: CommunicationRepository
    saved_views: SavedViewRepository
    field_definitions: FieldDefinitionRepository
    portal_forms: PortalFormRepository
    portal_resources: PortalResourceRepository
    file_requests: FileRequestRepository
    file_request_uploads: FileRequestUploadRepository


def create_repositories(db: Session) -> Repositories:
    return Repositories(
        events=SqlAlchemyEventRepository(db),
        tracks=SqlAlchemyTrackRepository(db),
        rooms=SqlAlchemyRoomRepository(db),
        formats=SqlAlchemyFormatRepository(db),
        tags=SqlAlchemyTagRepository(db),
        people=SqlAlchemyPersonRepository(db),
        forms=SqlAlchemyFormRepository(db),
        submissions=SqlAlchemySubmissionRepository(db),
        submission_participants=SqlAlchemySubmissionParticipantRepository(db),
        submission_tracks=SqlAlchemySubmissionTrackRepository(db),
        evaluation_plans=SqlEvaluationPlanRepository(db),
        review_assignments=SqlReviewAssignmentRepository(db),
        reviews=SqlReviewRepository(db),
        sessions=SqlSessionRepository(db),
        session_participants=SqlSessionParticipantRepository(db),
        task_templates=SqlTaskTemplateRepository(db),
        task_assignments=SqlTaskAssignmentRepository(db),
        event_people=SqlEventPersonRepository(db),
        files=SqlFileRepository(db),
        file_comments=SqlFileCommentRepository(db),
        email_templates=SqlEmailTemplateRepository(db),
        automations=SqlAutomationRepository(db),
        communications=SqlCommunicationRepository(db),
        saved_views=SqlSavedViewRepository(db),
        field_definitions=SqlFieldDefinitionRepository(db),
        portal_forms=SqlPortalFormRepository(db),
        portal_resources=SqlPortalResourceRepository(db),
        file_requests=SqlFileRequestRepository(db),
        file_request_uploads=SqlFileRequestUploadRepository(db),
    )
