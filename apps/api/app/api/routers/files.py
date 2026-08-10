import re
import tempfile
import zipfile

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import _authorize_event, get_principal, get_repos, require_event_role
from app.core.blob_storage import BlobStorage, get_blob_storage
from app.core.db import get_db
from app.repositories import Repositories
from app.schemas.ops import FileCommentCreate, UploadIntentRequest
from app.services import file_service

router = APIRouter(prefix="/api/v1", tags=["files"])

BUNDLE_MAX_BYTES = 250 * 1024 * 1024


@router.get("/events/{event_id}/files")
def list_files(
    event_id: str = Depends(require_event_role("owner", "admin")),
    file_type: str | None = Query(default=None),
    repos: Repositories = Depends(get_repos),
) -> list[dict]:
    files = repos.files.list_by_event(event_id, file_type)
    return [_view(f, repos) for f in files]


@router.get("/events/{event_id}/files/bundle.zip")
async def files_bundle(
    event_id: str = Depends(require_event_role("owner", "admin")),
    submission_ids: list[str] = Query(default=[]),
    file_ids: list[str] = Query(default=[]),
    repos: Repositories = Depends(get_repos),
    storage: BlobStorage = Depends(get_blob_storage),
):
    submissions = repos.submissions.list_by_event(event_id)
    selected = set(submission_ids)
    event_files = repos.files.list_by_event(event_id)
    selected_files: set[str] = set()
    for selected_file_id in dict.fromkeys(file_ids):
        selected_file = repos.files.get(selected_file_id)
        if selected_file is None or selected_file.event_id != event_id:
            raise HTTPException(status_code=404, detail=f"File {selected_file_id} not found")
        latest = next(
            (
                candidate
                for candidate in event_files
                if candidate.is_latest
                and any(version.id == selected_file_id for version in repos.files.list_versions(candidate.id))
            ),
            None,
        )
        if latest:
            selected_files.add(latest.id)
    known = {
        submission.id: submission
        for submission in submissions
        if not selected or submission.id in selected
    }

    # Spooled to disk past 8 MB so a large bundle never sits fully in RAM, and
    # never held twice (an in-memory buffer plus .getvalue() would peak at
    # ~2x the cap per concurrent request).
    spool = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024)
    total_size = 0
    try:
        with zipfile.ZipFile(spool, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for file in event_files:
                if not file.is_latest:
                    continue
                if selected_files and file.id not in selected_files:
                    continue
                if selected and file.submission_id not in selected:
                    continue
                _, content = await file_service.download(repos, storage, file.id)
                # Measured against real bytes, not the declared size_bytes: a stale
                # or zero declared size would otherwise let the cap be bypassed.
                total_size += len(content)
                if total_size > BUNDLE_MAX_BYTES:
                    raise HTTPException(status_code=413, detail="Submission bundle exceeds the 250 MB limit.")
                safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", file.filename).strip("._") or file.id
                if file.submission_id and file.submission_id in known:
                    submission = known[file.submission_id]
                    folder = submission.reference_code or submission.id
                elif file.session_id:
                    session = repos.sessions.get(file.session_id)
                    label = session.title if session else file.session_id
                    folder = f"session-{re.sub(r'[^A-Za-z0-9._-]+', '_', label).strip('._')}"
                elif file.person_id:
                    person = repos.people.get(file.person_id)
                    label = person.primary_email if person else file.person_id
                    folder = f"speaker-{re.sub(r'[^A-Za-z0-9@._-]+', '_', label).strip('._')}"
                else:
                    folder = "general"
                archive.writestr(f"{folder}/{safe_name}", content)
        spool.seek(0)
    except BaseException:
        spool.close()
        raise

    def stream():
        try:
            while chunk := spool.read(64 * 1024):
                yield chunk
        finally:
            spool.close()

    return StreamingResponse(
        stream(),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=submission-files.zip"},
    )


@router.post("/events/{event_id}/files/upload-intent")
def upload_intent(
    body: UploadIntentRequest,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    return file_service.upload_intent(db, repos, event_id, body)


def _file_authz(db, principal, file, write: bool) -> None:
    if _authorize_event(db, principal, file.event_id, {"owner", "admin"}):
        return
    # speaker access: their own files
    if (
        principal.kind == "user"
        and principal.user
        and principal.user.person_id
        and file.person_id == principal.user.person_id
    ):
        return
    raise HTTPException(status_code=403, detail="Insufficient permissions")


@router.post("/files/{file_id}/content")
async def store_content(
    file_id: str,
    request: Request,
    principal=Depends(get_principal),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
    storage: BlobStorage = Depends(get_blob_storage),
):
    file = repos.files.get(file_id)
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")
    _file_authz(db, principal, file, write=True)
    content = await request.body()
    return await file_service.store_content(db, repos, storage, file_id, content)


@router.post("/files/{file_id}/complete")
def complete_upload(
    file_id: str,
    principal=Depends(get_principal),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    file = repos.files.get(file_id)
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")
    _file_authz(db, principal, file, write=True)
    return {"id": file.id, "status": "complete"}


@router.get("/files/{file_id}/versions")
def list_file_versions(
    file_id: str,
    principal=Depends(get_principal),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    """Every version of a deliverable, newest first (CNT-04)."""
    file = repos.files.get(file_id)
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")
    _file_authz(db, principal, file, write=False)
    return [
        {
            "id": v.id,
            "filename": v.filename,
            "version": v.version,
            "is_latest": v.is_latest,
            "size_bytes": v.size_bytes,
            "uploaded_at": v.uploaded_at,
            "download_url": f"/api/v1/files/{v.id}/download",
        }
        for v in repos.files.list_versions(file_id)
    ]


@router.get("/files/{file_id}/comments")
def list_file_comments(
    file_id: str,
    principal=Depends(get_principal),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    file = repos.files.get(file_id)
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")
    _file_authz(db, principal, file, write=False)
    return [
        {
            "id": c.id,
            "author_name": c.author_name,
            "author_person_id": c.author_person_id,
            "body": c.body,
            "created_at": c.created_at,
        }
        for c in repos.file_comments.list_for_file(file_id)
    ]


@router.post("/files/{file_id}/comments", status_code=201)
def add_file_comment(
    body: FileCommentCreate,
    file_id: str,
    principal=Depends(get_principal),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    """Attach a note to a deliverable (CNT-05).

    Uses the same read authorisation as download, so organizers and the owning
    speaker can both comment and both see the thread.
    """
    file = repos.files.get(file_id)
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")
    _file_authz(db, principal, file, write=False)

    person_id = principal.user.person_id if principal.kind == "user" and principal.user else None
    person = repos.people.get(person_id) if person_id else None
    author_name = (
        " ".join(filter(None, [person.first_name, person.last_name])) or person.primary_email
        if person
        else "Organizer"
    )
    comment = repos.file_comments.create(
        {
            "file_id": file_id,
            "author_person_id": person_id,
            "author_name": author_name,
            "body": body.body,
        }
    )
    db.commit()
    return {
        "id": comment.id,
        "author_name": comment.author_name,
        "body": comment.body,
        "created_at": comment.created_at,
    }


@router.get("/files/{file_id}/download")
async def download_file(
    file_id: str,
    principal=Depends(get_principal),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
    storage: BlobStorage = Depends(get_blob_storage),
):
    file = repos.files.get(file_id)
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")
    _file_authz(db, principal, file, write=False)
    file_obj, content = await file_service.download(repos, storage, file_id)
    # Images are rendered in-page (headshots in the portal and on speaker cards),
    # everything else is a download. Serving an image as `attachment` makes the
    # browser offer a save dialog when the URL is opened directly.
    disposition = "inline" if (file_obj.content_type or "").startswith("image/") else "attachment"
    return Response(
        content=content,
        media_type=file_obj.content_type,
        headers={"Content-Disposition": f'{disposition}; filename="{file_obj.filename}"'},
    )


@router.delete("/files/{file_id}")
async def delete_file(
    file_id: str,
    principal=Depends(get_principal),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
    storage: BlobStorage = Depends(get_blob_storage),
):
    file = repos.files.get(file_id)
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")
    _file_authz(db, principal, file, write=True)
    await file_service.delete(db, repos, storage, file_id)
    return {"ok": True}


def _view(f, repos: Repositories | None = None) -> dict:
    person = repos.people.get(f.person_id) if repos and f.person_id else None
    session = repos.sessions.get(f.session_id) if repos and f.session_id else None
    request = repos.file_requests.get(f.file_request_id) if repos and f.file_request_id else None
    assignment = repos.task_assignments.get(f.task_assignment_id) if repos and f.task_assignment_id else None
    template = repos.task_templates.get(assignment.template_id) if repos and assignment else None
    return {
        "id": f.id,
        "event_id": f.event_id,
        "filename": f.filename,
        "content_type": f.content_type,
        "size_bytes": f.size_bytes,
        "file_type": f.file_type,
        "person_id": f.person_id,
        "submission_id": f.submission_id,
        "session_id": f.session_id,
        "task_assignment_id": f.task_assignment_id,
        "file_request_id": f.file_request_id,
        "uploaded_at": f.uploaded_at,
        "version": f.version,
        "is_latest": f.is_latest,
        "replaces_file_id": f.replaces_file_id,
        "person_name": " ".join(filter(None, [person.first_name, person.last_name])) if person else None,
        "person_email": person.primary_email if person else None,
        "session_title": session.title if session else None,
        "request_title": request.title if request else None,
        "request_due_at": request.due_at if request else None,
        "task_name": template.name if template else None,
    }
