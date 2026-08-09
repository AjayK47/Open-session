import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import (
    Principal,
    get_principal,
    get_repos,
    require_event_role,
    require_submission_access,
    require_submission_role,
    resolve_event_role,
)
from app.core.db import get_db
from app.models.program import Event
from app.repositories import Repositories
from app.schemas.ops import BulkDecisionRequest, DecisionRequest, ManualSubmissionCreate, SubmissionUpdate
from app.schemas.submissions import SubmissionRead
from app.services import evaluation_service, submission_service

router = APIRouter(prefix="/api/v1", tags=["submissions"])


@router.get("/events/{event_id}/submissions", response_model=list[SubmissionRead])
def list_submissions(
    event_id: str = Depends(require_event_role("owner", "admin")),
    status: str | None = Query(default=None),
    form_id: str | None = Query(default=None),
    track_id: str | None = Query(default=None),
    reference_code: str | None = Query(default=None),
    repos: Repositories = Depends(get_repos),
) -> list[SubmissionRead]:
    filters = {"status": status, "form_id": form_id, "track_id": track_id, "reference_code": reference_code}
    submissions = repos.submissions.list_by_event(event_id, {k: v for k, v in filters.items() if v})
    return [submission_service.to_read(repos, s) for s in submissions]


@router.post("/events/{event_id}/submissions", response_model=SubmissionRead, status_code=201)
def create_manual_submission(
    body: ManualSubmissionCreate,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> SubmissionRead:
    submission = submission_service.create_manual(db, repos, event_id, body)
    return submission_service.to_read(repos, submission)


@router.post("/events/{event_id}/submissions/bulk-decision")
def bulk_decision(
    body: BulkDecisionRequest,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    event = repos.events.get(event_id)
    return submission_service.bulk_decision(
        db, repos, event, body.submission_ids, body.target, notify=body.notify, message=body.message
    )


@router.get("/submissions/{submission_id}", response_model=SubmissionRead)
def get_submission(
    submission_id: str = Depends(require_submission_access),
    principal: Principal = Depends(get_principal),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> SubmissionRead:
    submission = repos.submissions.get(submission_id)
    result = submission_service.to_read(repos, submission)

    # Reviewers (never owner/admin) lose speaker identity when the covering
    # evaluation plan has blind_review enabled (§11.2 Privacy).
    role = resolve_event_role(db, principal, submission.event_id)
    if role == "reviewer" and evaluation_service.blind_review_active(repos, submission_id):
        result = submission_service.redact_for_blind_review(result)
    return result


@router.get("/submissions/{submission_id}/events")
def submission_events(
    submission_id: str = Depends(require_submission_access),
    db: Session = Depends(get_db),
):
    return submission_service.list_submission_events(db, submission_id)


@router.patch("/submissions/{submission_id}", response_model=SubmissionRead)
def update_submission(
    body: SubmissionUpdate,
    submission_id: str = Depends(require_submission_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> SubmissionRead:
    submission = submission_service.update_submission(db, repos, submission_id, body)
    return submission_service.to_read(repos, submission)


@router.post("/submissions/{submission_id}/submit", response_model=SubmissionRead)
def organizer_submit(
    submission_id: str = Depends(require_submission_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> SubmissionRead:
    from app.schemas.submissions import SubmissionWrite

    submission = repos.submissions.get(submission_id)
    form = repos.forms.get(submission.form_id)
    if form is None:
        raise HTTPException(status_code=400, detail="No form associated with this submission.")
    payload = SubmissionWrite(
        title=submission.title,
        description=submission.description,
        format_id=submission.format_id,
        track_id=submission.track_id,
        level=submission.level,
        custom_answers=submission.custom_answers_json or {},
        participants=[],
    )
    submission = submission_service.submit(db, repos, form, submission, payload)
    return submission_service.to_read(repos, submission)


@router.post("/submissions/{submission_id}/decision", response_model=SubmissionRead)
def make_decision(
    body: DecisionRequest,
    submission_id: str = Depends(require_submission_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
) -> SubmissionRead:
    submission = repos.submissions.get(submission_id)
    event: Event = repos.events.get(submission.event_id)
    submission = submission_service.decision(
        db, repos, event, submission, body.decision, body.notify, message=body.message
    )
    return submission_service.to_read(repos, submission)


@router.get("/events/{event_id}/submissions/export.csv")
def export_submissions_csv(
    event_id: str = Depends(require_event_role("owner", "admin")),
    status: str | None = Query(default=None),
    form_id: str | None = Query(default=None),
    track_id: str | None = Query(default=None),
    reference_code: str | None = Query(default=None),
    repos: Repositories = Depends(get_repos),
) -> Response:
    rows, headers = _export_rows(repos, event_id, status, form_id, track_id, reference_code)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    writer.writerows(rows)
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=submissions.csv"},
    )


@router.get("/events/{event_id}/submissions/export.xlsx")
def export_submissions_xlsx(
    event_id: str = Depends(require_event_role("owner", "admin")),
    status: str | None = Query(default=None),
    form_id: str | None = Query(default=None),
    track_id: str | None = Query(default=None),
    reference_code: str | None = Query(default=None),
    repos: Repositories = Depends(get_repos),
) -> Response:
    from openpyxl import Workbook

    rows, headers = _export_rows(repos, event_id, status, form_id, track_id, reference_code)
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Submissions"
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    output = io.BytesIO()
    workbook.save(output)
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=submissions.xlsx"},
    )


def _export_rows(repos, event_id, status, form_id, track_id, reference_code):
    filters = {
        "status": status,
        "form_id": form_id,
        "track_id": track_id,
        "reference_code": reference_code,
    }
    submissions = repos.submissions.list_by_event(event_id, {k: v for k, v in filters.items() if v})
    headers = [
        "id",
        "reference_code",
        "status",
        "title",
        "track_id",
        "format_id",
        "capacity",
        "ceu_credits",
        "client_session_id",
        "starts_at",
        "ends_at",
        "language",
        "submitter_email",
        "participants",
        "submitted_at",
    ]
    rows = []
    for submission in submissions:
        submitter = repos.people.get(submission.submitter_person_id) if submission.submitter_person_id else None
        participants = []
        for participant in repos.submission_participants.list_for_submission(submission.id):
            person = repos.people.get(participant.person_id)
            participants.append(person.primary_email if person else "")
        rows.append(
            [
                submission.id,
                submission.reference_code or "",
                submission.status,
                submission.title or "",
                submission.track_id or "",
                submission.format_id or "",
                submission.capacity if submission.capacity is not None else "",
                submission.ceu_credits if submission.ceu_credits is not None else "",
                submission.client_session_id or "",
                submission.starts_at.isoformat() if submission.starts_at else "",
                submission.ends_at.isoformat() if submission.ends_at else "",
                submission.language or "",
                submitter.primary_email if submitter else "",
                "; ".join(participants),
                submission.submitted_at.isoformat() if submission.submitted_at else "",
            ]
        )
    return rows, headers


@router.post("/events/{event_id}/submissions/import", response_model=list[SubmissionRead])
def import_submissions_csv(
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    raise HTTPException(
        status_code=501, detail="CSV import requires a file upload endpoint; use POST /files + manual create."
    )
