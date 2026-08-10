"""Run speaker reminder delivery on a fixed interval.

Cloudflare deployments use a Cron Trigger against the same internal endpoint.
The VPS Compose profile runs this small process beside the API instead of
requiring host-level cron configuration.
"""

import logging
import time

import httpx

from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("open-session-reminders")


def run_once() -> None:
    headers = {}
    if settings.internal_job_secret:
        headers["X-Open-Session-Job-Secret"] = settings.internal_job_secret
    response = httpx.post(
        f"{settings.internal_api_url.rstrip('/')}/internal/reminders/run",
        headers=headers,
        timeout=60,
    )
    response.raise_for_status()
    logger.info("Reminder run completed: %s", response.json())


def main() -> None:
    interval = max(settings.reminder_interval_seconds, 60)
    while True:
        try:
            run_once()
        except Exception:
            logger.exception("Reminder run failed; it will be retried")
        time.sleep(interval)


if __name__ == "__main__":
    main()
