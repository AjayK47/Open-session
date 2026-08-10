import hmac

from fastapi import APIRouter, Depends, Header, HTTPException

from app.api.deps import get_repos
from app.core.config import settings
from app.core.db import get_db
from app.jobs.reminders import run_due_reminders
from app.repositories import Repositories

router = APIRouter(prefix="/internal", tags=["internal"])


def _require_job_secret(x_open_session_job_secret: str | None = Header(default=None)) -> None:
    if settings.environment != "production":
        return
    expected = settings.internal_job_secret
    if not expected or not x_open_session_job_secret or not hmac.compare_digest(expected, x_open_session_job_secret):
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/reminders/run", dependencies=[Depends(_require_job_secret)])
def run_reminders(db=Depends(get_db), repos: Repositories = Depends(get_repos)) -> dict:
    """Find open tasks entering the reminder window and enqueue reminders (§17).

    Called by a scheduler/cron. Deduplication is handled by email_job_receipts.
    """
    return {"reminders_sent": run_due_reminders(db, repos)}
