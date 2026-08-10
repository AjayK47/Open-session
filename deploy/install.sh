#!/bin/sh
set -eu

REPOSITORY="AjayK47/Open-session"
VERSION="${OPEN_SESSION_VERSION:-main}"
INSTALL_DIR="${OPEN_SESSION_INSTALL_DIR:-$HOME/.open-session}"
RAW_BASE="https://raw.githubusercontent.com/$REPOSITORY/$VERSION"

say() {
  printf '%s\n' "$*"
}

fail() {
  printf 'Open Session installer: %s\n' "$*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl is required."
command -v openssl >/dev/null 2>&1 || fail "openssl is required."
command -v docker >/dev/null 2>&1 || fail "Docker is required: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || fail "The Docker Compose plugin is required."
docker info >/dev/null 2>&1 || fail "Docker is installed but the daemon is not available to this user."

mkdir -p "$INSTALL_DIR"
chmod 700 "$INSTALL_DIR"

say "Installing Open Session $VERSION in $INSTALL_DIR"
curl -fsSL "$RAW_BASE/compose.yaml" -o "$INSTALL_DIR/compose.yaml"

# Release builds may publish a detached checksum next to compose.yaml. Verify
# it when present while keeping main-branch preview installs available.
if curl -fsSL "$RAW_BASE/compose.yaml.sha256" -o "$INSTALL_DIR/compose.yaml.sha256" 2>/dev/null; then
  expected="$(awk '{print $1}' "$INSTALL_DIR/compose.yaml.sha256")"
  actual="$(openssl dgst -sha256 "$INSTALL_DIR/compose.yaml" | awk '{print $NF}')"
  [ "$expected" = "$actual" ] || fail "compose.yaml checksum verification failed."
fi

ENV_FILE="$INSTALL_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  default_url="${OPEN_SESSION_PUBLIC_URL:-http://localhost}"
  if [ -t 0 ]; then
    printf 'Public URL [%s]: ' "$default_url"
    read -r entered_url
    public_url="${entered_url:-$default_url}"
  else
    public_url="$default_url"
  fi

  case "$public_url" in
    http://*|https://*) ;;
    *) fail "The public URL must start with http:// or https://." ;;
  esac

  session_secret="$(openssl rand -hex 32)"
  job_secret="$(openssl rand -hex 32)"

  umask 077
  cat >"$ENV_FILE" <<EOF
OPEN_SESSION_VERSION=$VERSION
OPEN_SESSION_SITE_ADDRESS=$public_url
OPEN_SESSION_PUBLIC_URL=$public_url
OPEN_SESSION_HTTP_PORT=80
OPEN_SESSION_HTTPS_PORT=443
OPEN_SESSION_SESSION_SECRET=$session_secret
OPEN_SESSION_INTERNAL_JOB_SECRET=$job_secret
OPEN_SESSION_EMAIL_ENABLED=false
OPEN_SESSION_EMAIL_PROVIDER=cloudflare
OPEN_SESSION_EMAIL_SENDER_NAME=Open Session
OPEN_SESSION_EMAIL_SENDER_ADDRESS=noreply@localhost
OPEN_SESSION_CLOUDFLARE_API_TOKEN=
OPEN_SESSION_CLOUDFLARE_ACCOUNT_ID=
OPEN_SESSION_AI_REVIEW_ENABLED=false
OPEN_SESSION_OPENAI_API_KEY=
OPEN_SESSION_AI_REVIEW_MODEL=gpt-5.6-luna
OPEN_SESSION_COMPOSIO_API_KEY=
OPEN_SESSION_EVALUATION_MODE=false
OPEN_SESSION_REMINDER_INTERVAL_SECONDS=3600
EOF
  chmod 600 "$ENV_FILE"
else
  say "Keeping existing configuration at $ENV_FILE"
  public_url="$(awk -F= '$1 == "OPEN_SESSION_PUBLIC_URL" {sub($1 "=", ""); print; exit}' "$ENV_FILE")"
fi

cd "$INSTALL_DIR"
docker compose --env-file "$ENV_FILE" config --quiet
docker compose --env-file "$ENV_FILE" pull
docker compose --env-file "$ENV_FILE" up -d --remove-orphans

say "Waiting for Open Session to become healthy..."
attempt=0
while [ "$attempt" -lt 60 ]; do
  if curl -kfsS "${public_url%/}/health" >/dev/null 2>&1; then
    say "Open Session is running at $public_url"
    say "Configuration: $ENV_FILE"
    say "Logs: cd $INSTALL_DIR && docker compose logs -f"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 2
done

docker compose ps >&2
fail "The containers started but the health check did not pass. Run: cd $INSTALL_DIR && docker compose logs"
