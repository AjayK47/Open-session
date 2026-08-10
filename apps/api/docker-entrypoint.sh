#!/bin/sh
set -eu

if [ "${OPEN_SESSION_RUN_MIGRATIONS:-true}" = "true" ]; then
  uv run alembic upgrade head
fi

exec "$@"
