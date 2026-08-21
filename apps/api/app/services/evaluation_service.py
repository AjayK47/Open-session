from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.models.auth import RoleBinding, User
from app.models.evaluation import EvaluationPlan, ReviewAssignment
from app.repositories import Repositories

REVIEW_ASSIGNMENT_STATUSES = ("assigned", "in_progress", "completed")


def create_plan(db: Session, repos: Repositories, event_id: str, payload) -> EvaluationPlan:
    if payload.opens_at and payload.closes_at and payload.closes_at <= payload.opens_at:
        raise HTTPException(status_code=400, detail="Review close time must be after its open time.")
    plan = repos.evaluation_plans.create(
        event_id,
        {
            "name": payload.name,
            "instructions": payload.instructions,
            "scope_json": payload.scope.model_dump() if payload.scope else {},
            "criteria_json": [c.model_dump() for c in (payload.criteria or [])],
            "reviews_required": payload.reviews_required,
            "blind_review": payload.blind_review,
            "round_number": payload.round_number or 1,
            "opens_at": payload.opens_at,
            "closes_at": payload.closes_at,
        },
    )
    db.commit()
    return plan


def update_plan(db: Session, repos: Repositories, plan_id: str, patch: dict) -> EvaluationPlan:
    current = repos.evaluation_plans.get(plan_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Evaluation plan not found")
    opens_at = patch.get("opens_at", current.opens_at)
    closes_at = patch.get("closes_at", current.closes_at)
    if opens_at and closes_at and closes_at <= opens_at:
        raise HTTPException(status_code=400, detail="Review close time must be after its open time.")
    plan = repos.evaluation_plans.update(plan_id, patch)
    if plan is None:
        raise HTTPException(status_code=404, detail="Evaluation plan not found")
    db.commit()
    return plan


#: Statuses that are still awaiting a decision, and so are reviewable.
#: Scoping on "submitted" alone made a submission unassignable the moment it was
#: moved to pending review — the exact state a reviewer is meant to act on.
REVIEWABLE_STATUSES = ("submitted", "pending_review", "accept_queue", "decline_queue")


def scope_submissions(repos: Repositories, event_id: str, plan: EvaluationPlan) -> list:
    """Submissions matching the plan's scope (§11.2 Submission scope)."""
    submissions = [
        s for s in repos.submissions.list_by_event(event_id) if s.status in REVIEWABLE_STATUSES
    ]
    if not submissions:
        return []
    scope = plan.scope_json or {}
    form_id = scope.get("form_id")
    track_ids = scope.get("track_ids") or []
    if form_id:
        submissions = [s for s in submissions if s.form_id == form_id]
    if track_ids:
        # A talk submitted to several tracks is in scope if *any* of them is —
        # a reviewer covering "Infra" should see a talk cross-listed there even
        # when its primary track is something else.
        wanted = set(track_ids)
        extras = repos.submission_tracks.list_track_ids_by_event([s.id for s in submissions])
        submissions = [
            s for s in submissions if (s.track_id in wanted) or (wanted & set(extras.get(s.id, [])))
        ]
    return submissions


def assign_reviewers(
    db: Session,
    repos: Repositories,
    plan: EvaluationPlan,
    reviewer_emails: list[str],
    submission_ids: list[str] | None,
    strategy: str = "every",
    per_reviewer_cap: int | None = None,
    track_ids: list[str] | None = None,
    due_at: datetime | None = None,
) -> dict[str, Any]:
    """Assign reviewers to submissions (§11.2 Assignment, ABS-05/ABS-06).

    Two strategies, because "everyone reads everything" stops working the moment
    a CFP has more than a few dozen proposals:
      * `every`      — each reviewer gets every in-scope submission.
      * `distribute` — the set is dealt round-robin across reviewers, so each
                       sees a slice and the load is even.
    `per_reviewer_cap` bounds either one, and `track_ids` narrows the pool to
    submissions on those tracks before anything is dealt.
    """
    organization_id = repos.events.get(plan.event_id).organization_id
    reviewers = []
    for email in reviewer_emails:
        normalized_email = email.lower().strip()
        person = repos.people.upsert_by_email(organization_id, normalized_email, {})
        user = db.scalar(select(User).where(User.email == normalized_email))
        if user is None:
            user = User(email=normalized_email, person_id=person.id)
            db.add(user)
            db.flush()
        elif user.person_id is None:
            user.person_id = person.id
        binding = db.scalar(
            select(RoleBinding).where(
                RoleBinding.user_id == user.id,
                RoleBinding.event_id == plan.event_id,
                RoleBinding.role == "reviewer",
            )
        )
        if binding is None:
            db.add(RoleBinding(user_id=user.id, event_id=plan.event_id, role="reviewer"))
        reviewers.append(person)

    if not reviewers:
        raise HTTPException(status_code=400, detail="At least one reviewer is required.")

    if submission_ids:
        targets = list(submission_ids)
    else:
        scoped = scope_submissions(repos, plan.event_id, plan)
        if track_ids:
            wanted = set(track_ids)
            extras = repos.submission_tracks.list_track_ids_by_event([s.id for s in scoped])
            scoped = [
                s for s in scoped if (s.track_id in wanted) or (wanted & set(extras.get(s.id, [])))
            ]
        targets = [s.id for s in scoped]

    if not targets:
        raise HTTPException(status_code=400, detail="No submissions match the plan scope.")

    pairs: list[tuple[str, str]] = []
    if strategy == "distribute":
        for index, submission_id in enumerate(targets):
            person = reviewers[index % len(reviewers)]
            pairs.append((submission_id, person.id))
    else:
        for submission_id in targets:
            for person in reviewers:
                pairs.append((submission_id, person.id))

    counts: dict[str, int] = {}
    for person in reviewers:
        counts[person.id] = sum(
            1 for a in repos.review_assignments.list_for_reviewer(person.id) if a.evaluation_plan_id == plan.id
        )

    created, skipped = 0, 0
    for submission_id, person_id in pairs:
        if per_reviewer_cap is not None and counts.get(person_id, 0) >= per_reviewer_cap:
            skipped += 1
            continue
        if repos.review_assignments.get_for(submission_id, person_id, plan.id):
            continue
        repos.review_assignments.create(
            {
                "evaluation_plan_id": plan.id,
                "submission_id": submission_id,
                "reviewer_person_id": person_id,
                "status": "assigned",
                "assigned_at": utcnow(),
                "due_at": due_at,
            }
        )
        counts[person_id] = counts.get(person_id, 0) + 1
        created += 1

    db.commit()
    return {"created": created, "skipped_by_cap": skipped, "reviewers": len(reviewers), "submissions": len(targets)}


def blind_review_active(repos: Repositories, submission_id: str) -> bool:
    """True if any evaluation plan reviewing this submission has blind_review on (§11.2 Privacy).

    Used to strip speaker identity/company from the submission view shown to reviewers.
    """
    for assignment in repos.review_assignments.list_by_submission(submission_id):
        plan = repos.evaluation_plans.get(assignment.evaluation_plan_id)
        if plan is not None and plan.blind_review:
            return True
    return False


def reviewer_assignments(repos: Repositories, reviewer_person_id: str) -> list[dict[str, Any]]:
    rows = []
    for assignment in repos.review_assignments.list_for_reviewer(reviewer_person_id):
        submission = repos.submissions.get(assignment.submission_id)
        plan = repos.evaluation_plans.get(assignment.evaluation_plan_id)
        review = repos.reviews.get_by_assignment(assignment.id)
        rows.append(
            {
                "id": assignment.id,
                "submission_id": assignment.submission_id,
                "title": submission.title if submission else None,
                "track_id": submission.track_id if submission else None,
                "status": assignment.status,
                "due_at": assignment.due_at,
                "plan_id": plan.id if plan else None,
                "plan_name": plan.name if plan else None,
                "scores": review.scores_json if review else {},
                "comments": review.comments if review else None,
            }
        )
    return rows


def _weighted_score(plan: EvaluationPlan, scores: dict[str, Any]) -> float:
    criteria = plan.criteria_json or []
    total_weight = 0.0
    weighted = 0.0
    for criterion in criteria:
        key = criterion.get("key")
        weight = float(criterion.get("weight", 1.0))
        if key in scores and scores[key] is not None:
            try:
                weighted += float(scores[key]) * weight
                total_weight += weight
            except (TypeError, ValueError):
                continue
    return round(weighted / total_weight, 2) if total_weight else 0.0


def save_review(
    db: Session,
    repos: Repositories,
    assignment: ReviewAssignment,
    scores: dict[str, Any],
    comments: str | None,
    submit: bool,
) -> dict[str, Any]:
    plan = repos.evaluation_plans.get(assignment.evaluation_plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Evaluation plan not found")

    normalized_scores: dict[str, Any] = {}
    errors: dict[str, str] = {}
    for criterion in plan.criteria_json or []:
        key = criterion.get("key")
        if not key:
            continue
        value = scores.get(key)
        missing = value is None or value == ""
        if submit and criterion.get("required", True) and missing:
            errors[key] = "This criterion is required."
            continue
        if missing:
            continue
        criterion_type = criterion.get("type", "numeric")
        if criterion_type == "numeric":
            try:
                number = float(value)
            except (TypeError, ValueError):
                errors[key] = "Enter a number."
                continue
            scale_max = float(criterion.get("scale_max", 5))
            if number < 1 or number > scale_max:
                errors[key] = f"Enter a score from 1 to {scale_max:g}."
                continue
            normalized_scores[key] = int(number) if number.is_integer() else number
        elif criterion_type == "yes_no":
            if value not in (True, False, "yes", "no"):
                errors[key] = "Choose yes or no."
                continue
            normalized_scores[key] = value is True or value == "yes"
        elif criterion_type == "dropdown":
            options = criterion.get("options") or []
            if value not in options:
                errors[key] = "Choose one of the configured options."
                continue
            normalized_scores[key] = value
        else:
            normalized_scores[key] = str(value)

    if errors:
        raise HTTPException(status_code=400, detail=errors)

    weighted = _weighted_score(plan, normalized_scores)
    review = repos.reviews.get_by_assignment(assignment.id)
    if review is None:
        review = repos.reviews.create(
            {
                "assignment_id": assignment.id,
                "scores_json": normalized_scores,
                "weighted_score": weighted,
                "comments": comments,
            }
        )
    else:
        review.scores_json = normalized_scores
        review.weighted_score = weighted
        review.comments = comments
        db.flush()

    if submit:
        assignment.status = "completed"
        assignment.completed_at = utcnow()
        review.submitted_at = utcnow()
    else:
        assignment.status = "in_progress"

    _refresh_aggregate(db, repos, assignment.submission_id)
    db.commit()
    return {"assignment_id": assignment.id, "status": assignment.status, "weighted_score": weighted}


def _refresh_aggregate(db: Session, repos: Repositories, submission_id: str) -> None:
    submission = repos.submissions.get(submission_id)
    if submission is None:
        return
    scores = []
    for assignment in repos.review_assignments.list_by_submission(submission_id):
        if assignment.status != "completed":
            continue
        review = repos.reviews.get_by_assignment(assignment.id)
        if review and review.weighted_score is not None:
            scores.append(review.weighted_score)
    if scores:
        submission.aggregate_rating = round(sum(scores) / len(scores), 2)
    else:
        submission.aggregate_rating = None
    db.flush()


def aggregate_for_submission(repos: Repositories, submission_id: str) -> dict[str, Any]:
    assignments = repos.review_assignments.list_by_submission(submission_id)
    completed = [a for a in assignments if a.status == "completed"]
    submission = repos.submissions.get(submission_id)
    reviews = []
    for a in completed:
        review = repos.reviews.get_by_assignment(a.id)
        if review:
            reviews.append(
                {
                    "assignment_id": a.id,
                    "weighted_score": review.weighted_score,
                    "comments": review.comments,
                    "submitted_at": review.submitted_at,
                }
            )
    return {
        "total": len(assignments),
        "completed": len(completed),
        "completion_percent": round(len(completed) / len(assignments) * 100) if assignments else 0,
        "aggregate_rating": submission.aggregate_rating if submission else None,
        "reviews": reviews,
    }


def recuse(db: Session, repos: Repositories, assignment: ReviewAssignment, reason: str | None) -> dict[str, Any]:
    """Reviewer declares a conflict of interest instead of scoring (ABS-12).

    The assignment is kept rather than deleted so the organizer can see *why* a
    submission is short a review, and recused assignments are excluded from
    completion maths so they never look like outstanding work.
    """
    assignment.status = "recused"
    assignment.recused_at = utcnow()
    assignment.recusal_reason = reason
    db.commit()
    return {"id": assignment.id, "status": assignment.status, "recusal_reason": assignment.recusal_reason}


def reviewer_progress(repos: Repositories, plan: EvaluationPlan) -> list[dict[str, Any]]:
    """Per-reviewer completion for the progress dashboard (ABS-08)."""
    rows: dict[str, dict[str, Any]] = {}
    for assignment in repos.review_assignments.list_by_plan(plan.id):
        person = repos.people.get(assignment.reviewer_person_id)
        entry = rows.setdefault(
            assignment.reviewer_person_id,
            {
                "person_id": assignment.reviewer_person_id,
                "name": " ".join(filter(None, [person.first_name, person.last_name])) if person else "",
                "email": person.primary_email if person else "",
                "assigned": 0,
                "completed": 0,
                "recused": 0,
            },
        )
        if assignment.status == "recused":
            entry["recused"] += 1
            continue
        entry["assigned"] += 1
        if assignment.status == "completed":
            entry["completed"] += 1
    for entry in rows.values():
        entry["outstanding"] = entry["assigned"] - entry["completed"]
        entry["percent"] = round(100 * entry["completed"] / entry["assigned"]) if entry["assigned"] else 0
    return sorted(rows.values(), key=lambda r: (-r["outstanding"], r["name"]))


def plan_results(repos: Repositories, plan_id: str) -> list[dict[str, Any]]:
    """Submission progress and plan-specific aggregate scores for organizers."""
    grouped: dict[str, list[ReviewAssignment]] = {}
    for assignment in repos.review_assignments.list_by_plan(plan_id):
        grouped.setdefault(assignment.submission_id, []).append(assignment)

    rows: list[dict[str, Any]] = []
    for submission_id, assignments in grouped.items():
        submission = repos.submissions.get(submission_id)
        if submission is None:
            continue
        completed = [item for item in assignments if item.status == "completed"]
        recused = [item for item in assignments if item.status == "recused"]
        scores: list[float] = []
        for assignment in completed:
            review = repos.reviews.get_by_assignment(assignment.id)
            if review and review.weighted_score is not None:
                scores.append(review.weighted_score)
        speakers = []
        for participant in repos.submission_participants.list_for_submission(submission_id):
            person = repos.people.get(participant.person_id)
            if person:
                speakers.append(
                    {
                        "name": " ".join(filter(None, [person.first_name, person.last_name]))
                        or person.primary_email,
                        "role": participant.role,
                    }
                )
        rows.append(
            {
                "submission_id": submission_id,
                "reference_code": submission.reference_code,
                "title": submission.title,
                "status": submission.status,
                "assigned": len(assignments),
                "completed": len(completed),
                "recused": len(recused),
                "outstanding": len(assignments) - len(completed) - len(recused),
                "aggregate_score": round(sum(scores) / len(scores), 2) if scores else None,
                "speakers": speakers,
            }
        )
    return rows


def reviews_export_rows(repos: Repositories, event_id: str) -> list[dict[str, Any]]:
    """Flat rows of every review for CSV/XLSX export (ABS-13)."""
    rows: list[dict[str, Any]] = []
    for plan in repos.evaluation_plans.list_by_event(event_id):
        criteria = [c.get("key") for c in (plan.criteria_json or [])]
        for assignment in repos.review_assignments.list_by_plan(plan.id):
            submission = repos.submissions.get(assignment.submission_id)
            reviewer = repos.people.get(assignment.reviewer_person_id)
            review = repos.reviews.get_by_assignment(assignment.id)
            row = {
                "plan": plan.name,
                "round": plan.round_number,
                "reference_code": submission.reference_code if submission else "",
                "submission": submission.title if submission else "",
                "reviewer": reviewer.primary_email if reviewer else "",
                "status": assignment.status,
                "weighted_score": review.weighted_score if review else None,
                "comments": review.comments if review else "",
                "submitted_at": review.submitted_at.isoformat() if review and review.submitted_at else "",
            }
            scores = (review.scores_json or {}) if review else {}
            for key in criteria:
                row[f"score:{key}"] = scores.get(key)
            rows.append(row)
    return rows
