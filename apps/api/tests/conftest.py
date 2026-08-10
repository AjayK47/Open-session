"""Keep the test process isolated from a developer's populated .env file."""

import os

os.environ["OPEN_SESSION_ENVIRONMENT"] = "development"
os.environ["OPEN_SESSION_EMAIL_ENABLED"] = "false"
os.environ["OPEN_SESSION_RATE_LIMIT_ENABLED"] = "false"
