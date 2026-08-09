import csv
import io

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from sqlalchemy.orm import Session

from app.api.deps import (
    get_current_user,
    get_repos,
    require_event_role,
    require_person,
    require_plan_access,
    require_plan_role,
)
from app.core.db import get_db
from app.models.auth import User
from app.repositories import Repositories
from app.schemas.ops import (
    AiReviewOverrideRequest,
    AssignReviewersRequest,
    EvaluationPlanCreate,
    EvaluationPlanUpdate,
    RecusalRequest,
    ReviewWrite,
)
from app.services import ai_review_service, communication_service, evaluation_service

router = APIRouter(prefix="/api/v1", tags=["evaluations"])


@router.get("/events/{event_id}/evaluation-plans")
def list_plans(
    event_id: str = Depends(require_event_role("owner", "admin")),
    repos: Repositories = Depends(get_repos),
) -> list[dict]:
    rows = []
    for plan in repos.evaluation_plans.list_by_event(event_id):
        rows.append(_plan_view(repos, plan))
    return rows


@router.post("/events/{event_id}/evaluation-plans", status_code=201)
def create_plan(
    body: EvaluationPlanCreate,
    event_id: str = Depends(require_event_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    plan = evaluation_service.create_plan(db, repos, event_id, body)
    return _plan_view(repos, plan)


@router.get("/evaluation-plans/{plan_id}")
def get_plan(
    plan_id: str = Depends(require_plan_access),
    repos: Repositories = Depends(get_repos),
):
    plan = repos.evaluation_plans.get(plan_id)
    return _plan_view(repos, plan)


@router.patch("/evaluation-plans/{plan_id}")
def update_plan(
    body: EvaluationPlanUpdate,
    plan_id: str = Depends(require_plan_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    patch = body.model_dump(exclude_unset=True, exclude={"scope", "criteria"})
    if body.scope is not None:
        patch["scope_json"] = body.scope.model_dump()
    if body.criteria is not None:
        patch["criteria_json"] = [c.model_dump() for c in body.criteria]
    plan = evaluation_service.update_plan(db, repos, plan_id, patch)
    return _plan_view(repos, plan)


@router.post("/evaluation-plans/{plan_id}/assignments")
def assign_reviewers(
    body: AssignReviewersRequest,
    plan_id: str = Depends(require_plan_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    plan = repos.evaluation_plans.get(plan_id)
    result = evaluation_service.assign_reviewers(
        db,
        repos,
        plan,
        body.reviewers,
        body.submission_ids,
        strategy=body.strategy,
        per_reviewer_cap=body.per_reviewer_cap,
        track_ids=body.track_ids,
        due_at=body.due_at,
    )
    # `assigned` kept alongside the richer breakdown so existing callers, and the
    # frontend's success toast, keep working unchanged.
    return {"assigned": result["created"], **result}


@router.get("/evaluation-plans/{plan_id}/progress")
def plan_progress(
    plan_id: str = Depends(require_plan_role("owner", "admin")),
    repos: Repositories = Depends(get_repos),
):
    """Per-reviewer completion counts for the progress dashboard (ABS-08)."""
    plan = repos.evaluation_plans.get(plan_id)
    return evaluation_service.reviewer_progress(repos, plan)


@router.get("/evaluation-plans/{plan_id}/results")
def plan_results(
    plan_id: str = Depends(require_plan_role("owner", "admin")),
    repos: Repositories = Depends(get_repos),
):
    return evaluation_service.plan_results(repos, plan_id)


@router.post("/evaluation-plans/{plan_id}/remind")
def remind_reviewers(
    plan_id: str = Depends(require_plan_role("owner", "admin")),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    """Nudge every reviewer with outstanding assignments on this plan (ABS-09)."""
    plan = repos.evaluation_plans.get(plan_id)
    event = repos.events.get(plan.event_id)
    sent = 0
    for row in evaluation_service.reviewer_progress(repos, plan):
        if row["outstanding"] <= 0 or not row["email"]:
            continue
        communication_service.send(
            db,
            repos,
            plan.event_id,
            recipient_email=row["email"],
            recipient_person_id=row["person_id"],
            subject=f"{row['outstanding']} review(s) still open for {event.name}",
            html=(
                f"<p>Hi {row['name'] or 'there'},</p>"
                f"<p>You have <strong>{row['outstanding']}</strong> submission(s) left to review "
                f"for <strong>{plan.name}</strong>.</p>"
            ),
        )
        sent += 1
    return {"sent": sent}


@router.post("/review-assignments/{assignment_id}/recuse")
def recuse_assignment(
    body: RecusalRequest,
    assignment_id: str,
    person_id: str = Depends(require_person),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    """Reviewer declares a conflict of interest (ABS-12)."""
    assignment = repos.review_assignments.get(assignment_id)
    if assignment is None or assignment.reviewer_person_id != person_id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return evaluation_service.recuse(db, repos, assignment, body.reason)


@router.get("/evaluation-plans/{plan_id}/ai-reviews/{submission_id}")
def list_ai_reviews(
    submission_id: str,
    plan_id: str = Depends(require_plan_role("owner", "admin")),
    db: Session = Depends(get_db),
):
    return ai_review_service.list_runs(db, plan_id, submission_id)


@router.post("/evaluation-plans/{plan_id}/ai-reviews/{submission_id}")
def run_ai_review(
    submission_id: str,
    plan_id: str = Depends(require_plan_role("owner", "admin")),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    """Run a real structured model review and persist its complete audit record."""
    plan = repos.evaluation_plans.get(plan_id)
    return ai_review_service.run_review(db, repos, plan, submission_id, idempotency_key)


@router.patch("/evaluation-plans/{plan_id}/ai-reviews/{run_id}/override")
def override_ai_review(
    body: AiReviewOverrideRequest,
    run_id: str,
    plan_id: str = Depends(require_plan_role("owner", "admin")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ai_review_service.override(db, plan_id, run_id, body.score, body.reason, user.id)


@router.get("/events/{event_id}/reviews/export.csv")
def export_reviews_csv(
    event_id: str = Depends(require_event_role("owner", "admin")),
    repos: Repositories = Depends(get_repos),
):
    """Review scores and statuses as CSV (ABS-13)."""
    rows = evaluation_service.reviews_export_rows(repos, event_id)
    buffer = io.StringIO()
    if rows:
        writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    else:
        buffer.write("plan,round,reference_code,submission,reviewer,status,weighted_score,comments,submitted_at\n")
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=reviews.csv"},
    )


@router.get("/reviewer/assignments")
def reviewer_assignments(
    person_id: str = Depends(require_person),
    repos: Repositories = Depends(get_repos),
):
    return evaluation_service.reviewer_assignments(repos, person_id)


@router.post("/review-assignments/{assignment_id}/review")
def submit_review(
    body: ReviewWrite,
    assignment_id: str,
    person_id: str = Depends(require_person),
    db: Session = Depends(get_db),
    repos: Repositories = Depends(get_repos),
):
    assignment = repos.review_assignments.get(assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Review assignment not found")
    if assignment.reviewer_person_id != person_id:
        raise HTTPException(status_code=403, detail="Not your assignment")
    return evaluation_service.save_review(db, repos, assignment, body.scores, body.comments, body.submit)


def _plan_view(repos: Repositories, plan) -> dict:
    total = repos.review_assignments.count_by_plan(plan.id)
    completed = repos.review_assignments.count_completed_by_plan(plan.id)
    return {
        "id": plan.id,
        "event_id": plan.event_id,
        "name": plan.name,
        "instructions": plan.instructions,
        "scope": plan.scope_json or {},
        "criteria": plan.criteria_json or [],
        "reviews_required": plan.reviews_required,
        "blind_review": plan.blind_review,
        "round_number": plan.round_number,
        "opens_at": plan.opens_at,
        "closes_at": plan.closes_at,
        "assigned_submissions": total,
        "completed_reviews": completed,
        "in_progress_reviews": total - completed,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
    }
