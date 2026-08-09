from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import new_id
from app.repositories import Repositories

ALLOWED_TYPES = {"headshot", "slides", "supporting", "submission"}
MAX_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB

# Allow-listed content types and filename extensions per file_type (§26: "Validate
# MIME type, size, and extension for uploads"). Both must agree with the declared
# file_type, so a caller can't upload an .exe by relabeling its content_type.
ALLOWED_CONTENT_TYPES: dict[str, set[str]] = {
    "headshot": {"image/jpeg", "image/png", "image/webp", "image/gif"},
    "slides": {
        "application/pdf",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.oasis.opendocument.presentation",
    },
    "supporting": {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "image/jpeg",
        "image/png",
    },
    "submission": {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
    },
}

ALLOWED_EXTENSIONS: dict[str, set[str]] = {
    "headshot": {".jpg", ".jpeg", ".png", ".webp", ".gif"},
    "slides": {".pdf", ".ppt", ".pptx", ".odp", ".key"},
    "supporting": {".pdf", ".doc", ".docx", ".txt", ".jpg", ".jpeg", ".png"},
    "submission": {".pdf", ".doc", ".docx", ".txt"},
}


def _root() -> Path:
    root = Path(settings.files_storage_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _path_for(event_id: str, file_id: str) -> Path:
    directory = _root() / event_id
    directory.mkdir(parents=True, exist_ok=True)
    return directory / file_id


def upload_intent(db: Session, repos: Repositories, event_id: str, payload) -> dict:
    if payload.file_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type.")
    if payload.size_bytes and payload.size_bytes > MAX_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 50 MB).")

    extension = Path(payload.filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS[payload.file_type]:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS[payload.file_type]))
        label = extension or "no extension"
        raise HTTPException(
            status_code=400,
            detail=f"'{label}' is not allowed for {payload.file_type} uploads. Allowed: {allowed}",
        )

    content_type = payload.content_type.split(";")[0].strip().lower()
    if content_type not in ALLOWED_CONTENT_TYPES[payload.file_type]:
        allowed = ", ".join(sorted(ALLOWED_CONTENT_TYPES[payload.file_type]))
        raise HTTPException(
            status_code=400,
            detail=f"Content type '{content_type}' is not allowed for {payload.file_type} uploads. Allowed: {allowed}",
        )

    file = repos.files.create(
        {
            "event_id": event_id,
            "storage_key": f"{event_id}/{new_id()}",
            "filename": payload.filename,
            "content_type": payload.content_type,
            "size_bytes": payload.size_bytes or 0,
            "file_type": payload.file_type,
            "person_id": payload.person_id,
            "submission_id": payload.submission_id,
            "session_id": payload.session_id,
            "task_assignment_id": payload.task_assignment_id,
            "file_request_id": payload.file_request_id,
        }
    )
    db.commit()
    return {"id": file.id, "upload_url": f"/api/v1/files/{file.id}/content"}


def store_content(db: Session, repos: Repositories, file_id: str, content: bytes) -> dict:
    file = repos.files.get(file_id)
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")
    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB).")
    if not _matches_file_signature(file.filename, file.content_type, content):
        raise HTTPException(status_code=400, detail="File content does not match its declared type.")
    path = _path_for(file.event_id, file.id)
    path.write_bytes(content)
    file.size_bytes = len(content)

    _apply_versioning(repos, file)

    # A headshot is not just another attachment: it *is* the person's photo on
    # the program and in the portal. Point the person at it here, once the bytes
    # actually exist, so the profile can never reference a half-finished upload.
    if file.file_type == "headshot" and file.person_id:
        person = repos.people.get(file.person_id)
        if person is not None:
            person.headshot_file_id = file.id

    db.commit()
    return {"id": file.id, "size_bytes": len(content)}


def _matches_file_signature(filename: str, content_type: str, content: bytes) -> bool:
    """Verify common upload signatures instead of trusting browser metadata."""
    extension = Path(filename).suffix.lower()
    mime = (content_type or "").split(";", 1)[0].lower()
    if extension in {".jpg", ".jpeg"}:
        return content.startswith(b"\xff\xd8\xff")
    if extension == ".png":
        return content.startswith(b"\x89PNG")
    if extension == ".gif":
        return content.startswith((b"GIF87a", b"GIF89a"))
    if extension == ".webp":
        return len(content) >= 12 and content.startswith(b"RIFF") and content[8:12] == b"WEBP"
    if extension == ".pdf":
        return content.startswith(b"%PDF")
    if extension in {".docx", ".pptx", ".odp", ".key"}:
        return content.startswith(b"PK\x03\x04")
    if extension in {".doc", ".ppt"}:
        return content.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")
    if extension == ".txt" and mime == "text/plain":
        try:
            content.decode("utf-8")
        except UnicodeDecodeError:
            return False
        return b"\x00" not in content
    return False


def _apply_versioning(repos: Repositories, file) -> None:
    """Chain this upload onto any previous version of the same deliverable.

    "Same deliverable" means the same file_type against the same task, session or
    submission — that is what a speaker means when they re-upload their slides.
    The previous row keeps its bytes and stops being `is_latest`.
    """
    previous = repos.files.find_previous_version(file)
    if previous is None:
        return
    previous.is_latest = False
    file.version = previous.version + 1
    file.replaces_file_id = previous.id


def download(repos: Repositories, file_id: str):
    file = repos.files.get(file_id)
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")
    path = _path_for(file.event_id, file.id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File content not found")
    content = path.read_bytes()
    return file, content


def delete(db: Session, repos: Repositories, file_id: str) -> None:
    file = repos.files.get(file_id)
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")
    path = _path_for(file.event_id, file.id)
    if path.exists():
        path.unlink()
    repos.files.delete(file_id)
    db.commit()
