from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_repos, require_event_role, require_file_request_role, require_person
from app.core.db import get_db
from app.repositories import Repositories
from app.schemas.ops import UploadIntentRequest
from app.schemas.portal import FileRequestCreate, FileRequestReminderRequest, FileRequestUpdate
from app.services import communication_service, file_service

router = APIRouter(prefix="/api/v1", tags=["file requests"])


def _view(request, repos: Repositories | None = None) -> dict:
    uploads = []
    deliverables = []
    session_title = None
    if repos:
        session = repos.sessions.get(request.session_id) if request.session_id else None
        session_title = session.title if session else None
        uploads = [
            {
                "id": upload.id,
                "person_id": upload.person_id,
                "file_id": upload.file_id,
                "uploaded_at": upload.uploaded_at,
            }
            for upload in repos.file_request_uploads.list_for_request(request.id)
        ]
        assigned_ids = request.assigned_person_ids_json or [
            event_person.person_id for event_person in repos.event_people.list_speakers(request.event_id)
        ]
        latest_by_person = {}
        for upload in uploads:
            latest_by_person.setdefault(upload["person_id"], upload)
        now = datetime.now(UTC)
        for person_id in assigned_ids:
            person = repos.people.get(person_id)
            upload = latest_by_person.get(person_id)
            file = repos.files.get(upload["file_id"]) if upload else None
            deliverables.append(
                {
                    "person_id": person_id,
                    "person_name": " ".join(filter(None, [person.first_name, person.last_name])) if person else None,
                    "person_email": person.primary_email if person else None,
                    "status": "uploaded" if file else "outstanding",
                    "overdue": bool(request.due_at and request.due_at < now and not file),
                    "file_id": file.id if file else None,
                    "filename": file.filename if file else None,
                    "file_type": file.file_type if file else None,
                    "uploaded_at": file.uploaded_at if file else None,
                    "version": file.version if file else None,
                }
            )
    return {
        "id": request.id,
        "event_id": request.event_id,
        "title": request.title,
        "instructions_html": request.instructions_html,
        "target_type": request.target_type,
        "due_at": request.due_at,
        "session_id": request.session_id,
        "session_title": session_title,
        "assigned_person_ids": request.assigned_person_ids_json or [],
        "accepted_extensions": request.accepted_extensions_json or [],
        "max_size_mb": request.max_size_mb,
        "uploads": uploads,
        "deliverables": deliverables,
        "created_at": request.created_at,
        "updated_at": request.updated_at,
    }


@router.get("/events/{event_id}/file-requests")
def list_requests(
    event_id: str = Depends(require_event_role("owner", "admin")),
    repos: Repositories = Depends(get_repos),
):
    return [_view(request, repos) for request in repos.file_requests.list_by_event(event_id)]


@router.post("/events/{event_id}/file-requests", status_code=201)
def create_request(
    body: FileRequestCreate,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    data = body.model_dump(exclude={"assigned_person_ids", "accepted_extensions"})
    data["assigned_person_ids_json"] = body.assigned_person_ids
    data["accepted_extensions_json"] = [extension.lower().lstrip(".") for extension in body.accepted_extensions]
    request = repos.file_requests.create(event_id, data)
    db.commit()
    return _view(request, repos)


@router.post("/events/{event_id}/file-requests/remind")
def remind_outstanding_requests(
    body: FileRequestReminderRequest,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    """Send one personalized reminder per selected outstanding deliverable."""
    event = repos.events.get(event_id)
    sent = 0
    for item in dict.fromkeys((entry.request_id, entry.person_id) for entry in body.items):
        request_id, person_id = item
        request = repos.file_requests.get(request_id)
        person = repos.people.get(person_id)
        if request is None or request.event_id != event_id or person is None:
            continue
        assigned = request.assigned_person_ids_json or [
            event_person.person_id for event_person in repos.event_people.list_speakers(event_id)
        ]
        if person_id not in assigned:
            continue
        if any(upload.person_id == person_id for upload in repos.file_request_uploads.list_for_request(request_id)):
            continue
        communication_service.send_automated(
            db,
            repos,
            event_id,
            "task_reminder",
            recipient_person_id=person.id,
            recipient_email=person.primary_email,
            context={
                "speaker": {"first_name": person.first_name or ""},
                "event": {"name": event.name if event else ""},
                "task": {
                    "name": request.title,
                    "due_date": request.due_at.strftime("%Y-%m-%d") if request.due_at else "",
                    "instructions": request.instructions_html or "",
                },
            },
        )
        sent += 1
    return {"sent": sent}


@router.patch("/file-requests/{request_id}")
def update_request(
    body: FileRequestUpdate,
    request_id: str = Depends(require_file_request_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    patch = body.model_dump(exclude_unset=True, exclude={"assigned_person_ids", "accepted_extensions"})
    if body.assigned_person_ids is not None:
        patch["assigned_person_ids_json"] = body.assigned_person_ids
    if body.accepted_extensions is not None:
        patch["accepted_extensions_json"] = [extension.lower().lstrip(".") for extension in body.accepted_extensions]
    request = repos.file_requests.update(request_id, patch)
    db.commit()
    return _view(request, repos)


@router.delete("/file-requests/{request_id}")
def delete_request(
    request_id: str = Depends(require_file_request_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    repos.file_requests.delete(request_id)
    db.commit()
    return {"ok": True}


@router.get("/me/file-requests")
def my_file_requests(person_id: str = Depends(require_person), repos: Repositories = Depends(get_repos)):
    rows = []
    seen = set()
    for event_person in repos.event_people.list_for_person(person_id):
        for request in repos.file_requests.list_by_event(event_person.event_id):
            assigned = request.assigned_person_ids_json or []
            if assigned and person_id not in assigned:
                continue
            if request.id in seen:
                continue
            seen.add(request.id)
            rows.append(_view(request, repos))
    return rows


@router.post("/me/file-requests/{request_id}/upload-intent")
def my_file_request_upload_intent(
    body: UploadIntentRequest,
    request_id: str,
    person_id: str = Depends(require_person),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    request = repos.file_requests.get(request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="File request not found")
    if repos.event_people.get(request.event_id, person_id) is None:
        raise HTTPException(status_code=403, detail="You are not part of this event")
    assigned = request.assigned_person_ids_json or []
    if assigned and person_id not in assigned:
        raise HTTPException(status_code=403, detail="This file request is not assigned to you")
    extension = body.filename.rsplit(".", 1)[-1].lower() if "." in body.filename else ""
    if request.accepted_extensions_json and extension not in request.accepted_extensions_json:
        raise HTTPException(status_code=400, detail="This file type is not accepted for the request")
    if body.size_bytes and body.size_bytes > request.max_size_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds this request's {request.max_size_mb} MB limit")
    payload = body.model_copy(update={"person_id": person_id, "file_request_id": request_id})
    intent = file_service.upload_intent(db, repos, request.event_id, payload)
    repos.file_request_uploads.create({"file_request_id": request_id, "person_id": person_id, "file_id": intent["id"]})
    db.commit()
    return intent
