"""Real, persisted AI-assisted abstract review using structured model output."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from fastapi import HTTPException
from openai import OpenAI
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import utcnow
from app.models.evaluation import AiReviewRun, EvaluationPlan
from app.repositories import Repositories

PROMPT_VERSION = "abstract-review-v1"
_IDENTITY_KEY = re.compile(r"speaker|presenter|author|email|name|company|employer|bio", re.IGNORECASE)


class CriterionAssessment(BaseModel):
    key: str
    score: float | None = None
    rationale: str = Field(min_length=1, max_length=1200)
    flags: list[str] = Field(default_factory=list, max_length=8)


class AiReviewOutput(BaseModel):
    criteria: list[CriterionAssessment]
    overall_score: float = Field(ge=0, le=10)
    summary: str = Field(min_length=1, max_length=2400)
    flags: list[str] = Field(default_factory=list, max_length=12)


def _client() -> OpenAI:
    return OpenAI(api_key=settings.openai_api_key, timeout=settings.ai_review_timeout_seconds)


def _rubric_version(plan: EvaluationPlan) -> str:
    payload = json.dumps(plan.criteria_json or [], sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


def _safe_custom_answers(submission, blind_review: bool) -> dict[str, Any]:
    answers = dict(submission.custom_answers_json or {})
    if blind_review:
        answers = {key: value for key, value in answers.items() if not _IDENTITY_KEY.search(key)}
    return answers


def _review_input(plan: EvaluationPlan, submission) -> str:
    payload = {
        "proposal": {
            "title": submission.title,
            "abstract": re.sub(r"<[^>]+>", " ", submission.description or "").strip(),
            "audience_level": submission.level,
            "language": submission.language,
            "custom_answers": _safe_custom_answers(submission, plan.blind_review),
        },
        "rubric": plan.criteria_json or [],
        "review_round": plan.round_number,
        "blind_review": plan.blind_review,
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def _validate_against_rubric(output: AiReviewOutput, plan: EvaluationPlan) -> None:
    rubric = {criterion.get("key"): criterion for criterion in plan.criteria_json or [] if criterion.get("key")}
    received = {criterion.key: criterion for criterion in output.criteria}
    unknown = sorted(set(received) - set(rubric))
    if unknown:
        raise ValueError(f"Model returned unknown criterion keys: {', '.join(unknown)}")
    for key, criterion in rubric.items():
        if criterion.get("type", "numeric") != "numeric":
            continue
        assessment = received.get(key)
        if assessment is None or assessment.score is None:
            raise ValueError(f"Model omitted numeric criterion: {key}")
        scale_max = float(criterion.get("scale_max", 5))
        if assessment.score < 1 or assessment.score > scale_max:
            raise ValueError(f"Model score for {key} must be between 1 and {scale_max:g}")


def _view(run: AiReviewRun) -> dict[str, Any]:
    return {
        "id": run.id,
        "event_id": run.event_id,
        "evaluation_plan_id": run.evaluation_plan_id,
        "submission_id": run.submission_id,
        "status": run.status,
        "model": run.model,
        "provider_response_id": run.provider_response_id,
        "prompt_version": run.prompt_version,
        "rubric_version": run.rubric_version,
        "criteria": run.criterion_scores_json or [],
        "overall_score": run.overall_score,
        "rationale": run.rationale,
        "flags": run.flags_json or [],
        "input_tokens": run.input_tokens,
        "output_tokens": run.output_tokens,
        "error": run.error,
        "override_score": run.override_score,
        "override_reason": run.override_reason,
        "override_by_user_id": run.override_by_user_id,
        "overridden_at": run.overridden_at,
        "created_at": run.created_at,
        "updated_at": run.updated_at,
    }


def list_runs(db: Session, plan_id: str, submission_id: str) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(AiReviewRun)
        .where(AiReviewRun.evaluation_plan_id == plan_id, AiReviewRun.submission_id == submission_id)
        .order_by(AiReviewRun.created_at.desc())
    )
    return [_view(row) for row in rows]


def run_review(
    db: Session,
    repos: Repositories,
    plan: EvaluationPlan,
    submission_id: str,
    idempotency_key: str | None,
) -> dict[str, Any]:
    if not settings.ai_review_enabled or not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="AI review is not configured for this deployment.")
    submission = repos.submissions.get(submission_id)
    if submission is None or submission.event_id != plan.event_id:
        raise HTTPException(status_code=404, detail="Submission not found")

    if idempotency_key:
        existing = db.scalar(
            select(AiReviewRun).where(
                AiReviewRun.evaluation_plan_id == plan.id,
                AiReviewRun.submission_id == submission_id,
                AiReviewRun.idempotency_key == idempotency_key,
            )
        )
        if existing:
            return _view(existing)

    count = db.scalar(
        select(func.count()).select_from(AiReviewRun).where(
            AiReviewRun.evaluation_plan_id == plan.id,
            AiReviewRun.submission_id == submission_id,
        )
    ) or 0
    if count >= settings.ai_review_max_runs_per_submission:
        raise HTTPException(status_code=429, detail="AI review run limit reached for this submission and round.")

    run = AiReviewRun(
        event_id=plan.event_id,
        evaluation_plan_id=plan.id,
        submission_id=submission_id,
        idempotency_key=idempotency_key,
        status="running",
        model=settings.ai_review_model,
        prompt_version=PROMPT_VERSION,
        rubric_version=_rubric_version(plan),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        response = _client().responses.parse(
            model=settings.ai_review_model,
            instructions=(
                "You are an advisory conference program reviewer. Assess only the supplied proposal against the "
                "supplied rubric. Do not infer speaker identity or protected traits. Give concrete, proposal-grounded "
                "reasons. Your output is a suggestion for a human organizer, never a final decision."
            ),
            input=_review_input(plan, submission),
            text_format=AiReviewOutput,
            reasoning={"effort": "low"},
            max_output_tokens=2500,
            store=False,
        )
        parsed = response.output_parsed
        if parsed is None:
            raise ValueError("Model returned no structured review")
        _validate_against_rubric(parsed, plan)
        run.status = "completed"
        run.provider_response_id = response.id
        run.criterion_scores_json = [item.model_dump() for item in parsed.criteria]
        run.overall_score = parsed.overall_score
        run.rationale = parsed.summary
        run.flags_json = parsed.flags
        if response.usage:
            run.input_tokens = response.usage.input_tokens
            run.output_tokens = response.usage.output_tokens
        db.commit()
        db.refresh(run)
        return _view(run)
    except Exception as exc:
        run.status = "failed"
        run.error = str(exc)[:4000]
        db.commit()
        raise HTTPException(status_code=502, detail={"message": "AI review failed", "run_id": run.id}) from exc


def override(
    db: Session,
    plan_id: str,
    run_id: str,
    score: float,
    reason: str,
    user_id: str,
) -> dict[str, Any]:
    run = db.get(AiReviewRun, run_id)
    if run is None or run.evaluation_plan_id != plan_id:
        raise HTTPException(status_code=404, detail="AI review not found")
    if run.status != "completed":
        raise HTTPException(status_code=409, detail="Only completed AI reviews can be overridden.")
    run.override_score = score
    run.override_reason = reason
    run.override_by_user_id = user_id
    run.overridden_at = utcnow()
    db.commit()
    db.refresh(run)
    return _view(run)
