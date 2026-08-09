from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_repos, require_person
from app.core.db import get_db
from app.repositories import Repositories
from app.schemas.ops import CompleteTaskRequest, ProfileUpdate
from app.schemas.portal import PortalFormTaskSubmit
from app.schemas.submissions import SubmissionRead, SubmissionWrite
from app.services import file_service, portal_service, speaker_service, submission_service, task_service

router = APIRouter(prefix="/api/v1/me", tags=["speaker portal"])


def _person(repos: Repositories, person_id: str):
    person = repos.people.get(person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return person


@router.get("/profile")
def my_profile(person_id: str = Depends(require_person), repos: Repositories = Depends(get_repos)) -> dict:
    person = _person(repos, person_id)
    files = repos.files.list_for_person(person_id)
    return {
        "person_id": person.id,
        "email": person.primary_email,
        "first_name": person.first_name,
        "last_name": person.last_name,
        "bio": person.bio,
        "company": person.company,
        "job_title": person.job_title,
        "phone": person.phone,
        "website": person.website,
        "linkedin_url": person.linkedin_url,
        "x_url": person.x_url,
        "headshot_file_id": person.headshot_file_id,
        "files": [
            {"id": f.id, "filename": f.filename, "file_type": f.file_type, "size_bytes": f.size_bytes} for f in files
        ],
    }


@router.patch("/profile")
def update_my_profile(
    body: ProfileUpdate,
    person_id: str = Depends(require_person),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> dict:
    person = speaker_service.update_profile(db, repos, person_id, body)
    return {
        "person_id": person.id,
        "email": person.primary_email,
        "first_name": person.first_name,
        "last_name": person.last_name,
    }


@router.get("/submissions", response_model=list[SubmissionRead])
def my_submissions(person_id: str = Depends(require_person), repos: Repositories = Depends(get_repos)):
    submissions = repos.submissions.list_involving_person(person_id)
    return [submission_service.to_read(repos, s) for s in submissions]


@router.patch("/submissions/{submission_id}", response_model=SubmissionRead)
def edit_my_submission(
    body: SubmissionWrite,
    submission_id: str,
    user=Depends(get_current_user),
    person_id: str = Depends(require_person),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    submission = repos.submissions.get(submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    participant_ids = {p.person_id for p in repos.submission_participants.list_for_submission(submission_id)}
    if submission.submitter_person_id != person_id and person_id not in participant_ids:
        raise HTTPException(status_code=403, detail="You are not a participant on this submission")
    updated = submission_service.update_speaker_submission(
        db,
        repos,
        submission,
        body,
        actor_user_id=user.id,
        actor_person_id=person_id,
    )
    return submission_service.to_read(repos, updated)


@router.get("/tasks")
def my_tasks(person_id: str = Depends(require_person), repos: Repositories = Depends(get_repos)) -> list[dict]:
    rows = []
    for assignment in repos.task_assignments.list_for_person(person_id):
        template = repos.task_templates.get(assignment.template_id) if assignment.template_id else None
        rows.append(
            {
                "id": assignment.id,
                "event_id": assignment.event_id,
                "name": template.name if template else "Task",
                "instructions": template.instructions if template else None,
                "task_type": template.task_type if template else "custom",
                "status": assignment.status,
                "due_at": assignment.due_at,
                "completed_at": assignment.completed_at,
                "session_id": assignment.session_id,
                "submission_id": assignment.submission_id,
            }
        )
    return rows


@router.post("/tasks/{assignment_id}/complete")
def complete_my_task(
    body: CompleteTaskRequest,
    assignment_id: str,
    person_id: str = Depends(require_person),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    assignment = repos.task_assignments.get(assignment_id)
    if assignment is None or assignment.person_id != person_id:
        raise HTTPException(status_code=404, detail="Task assignment not found")
    assignment = task_service.complete_assignment(db, repos, assignment, body.completion_data)
    return {"id": assignment.id, "status": assignment.status, "completed_at": assignment.completed_at}


@router.get("/tasks/{assignment_id}/form")
def get_my_task_form(
    assignment_id: str,
    person_id: str = Depends(require_person),
    repos: Repositories = Depends(get_repos),
):
    assignment = repos.task_assignments.get(assignment_id)
    if assignment is None or assignment.person_id != person_id:
        raise HTTPException(status_code=404, detail="Task assignment not found")
    template = repos.task_templates.get(assignment.template_id)
    if template is None or template.task_type != "form" or not template.portal_form_id:
        raise HTTPException(status_code=400, detail="This task is not backed by a portal form.")
    form = repos.portal_forms.get(template.portal_form_id)
    if form is None:
        raise HTTPException(status_code=404, detail="Portal form not found")
    return {
        "assignment_id": assignment.id,
        "form": {
            "id": form.id,
            "name": form.name,
            "description": form.description,
            "sections": form.sections_json or [],
            "settings": form.settings_json or {},
        },
        "answers": (assignment.completion_data_json or {}).get("answers", {}),
        "status": assignment.status,
    }


@router.post("/tasks/{assignment_id}/submit-form")
def submit_my_task_form(
    body: PortalFormTaskSubmit,
    assignment_id: str,
    person_id: str = Depends(require_person),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    assignment = repos.task_assignments.get(assignment_id)
    if assignment is None or assignment.person_id != person_id:
        raise HTTPException(status_code=404, detail="Task assignment not found")
    return portal_service.submit_task_form(db, repos, assignment, body.answers)


@router.get("/sessions")
def my_sessions(person_id: str = Depends(require_person), repos: Repositories = Depends(get_repos)) -> list[dict]:
    rows = []
    for participant in repos.session_participants.list_for_person(person_id):
        session = repos.sessions.get(participant.session_id)
        if session is None:
            continue
        room = repos.rooms.get(session.room_id) if session.room_id else None
        track = repos.tracks.get(session.track_id) if session.track_id else None
        rows.append(
            {
                "id": session.id,
                "event_id": session.event_id,
                "title": session.title,
                "status": session.status,
                "starts_at": session.starts_at,
                "ends_at": session.ends_at,
                "room_name": room.name if room else None,
                "track_name": track.name if track else None,
                "role": participant.role,
            }
        )
    return rows


@router.get("/files")
def my_files(person_id: str = Depends(require_person), repos: Repositories = Depends(get_repos)) -> list[dict]:
    return [
        {
            "id": f.id,
            "filename": f.filename,
            "content_type": f.content_type,
            "size_bytes": f.size_bytes,
            "file_type": f.file_type,
            "submission_id": f.submission_id,
            "session_id": f.session_id,
            "task_assignment_id": f.task_assignment_id,
            "file_request_id": f.file_request_id,
            "uploaded_at": f.uploaded_at,
            "version": f.version,
            "is_latest": f.is_latest,
            "replaces_file_id": f.replaces_file_id,
        }
        for f in repos.files.list_for_person(person_id)
    ]


@router.post("/files/upload-intent")
def my_upload_intent(
    body: dict,
    person_id: str = Depends(require_person),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    from app.schemas.ops import UploadIntentRequest

    event_id = body.get("event_id")
    if not event_id:
        raise HTTPException(status_code=400, detail="event_id is required.")
    if repos.event_people.get(event_id, person_id) is None:
        raise HTTPException(status_code=403, detail="You are not a speaker at this event.")

    payload = UploadIntentRequest(
        filename=body["filename"],
        content_type=body["content_type"],
        size_bytes=body.get("size_bytes"),
        file_type=body["file_type"],
        person_id=person_id,
        submission_id=body.get("submission_id"),
        session_id=body.get("session_id"),
        task_assignment_id=body.get("task_assignment_id"),
        file_request_id=body.get("file_request_id"),
    )
    return file_service.upload_intent(db, repos, event_id, payload)
