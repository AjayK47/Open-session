#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
api_dir="$project_root/apps/api"
cloudflare_dir="$api_dir/cloudflare"
build_dir="$cloudflare_dir/.build"
template="$cloudflare_dir/wrangler.template.jsonc"
generated="$build_dir/wrangler.jsonc"

command -v uv >/dev/null 2>&1 || {
  printf 'uv is required (version 0.8 or newer).\n' >&2
  exit 1
}
command -v node >/dev/null 2>&1 || {
  printf 'Node.js 22 is required.\n' >&2
  exit 1
}

uv_version=$(uv --version | awk '{print $2}')
uv_major=$(printf '%s' "$uv_version" | cut -d. -f1)
uv_minor=$(printf '%s' "$uv_version" | cut -d. -f2)
if [ "$uv_major" -eq 0 ] && [ "$uv_minor" -lt 8 ]; then
  printf 'uv 0.8 or newer is required; found %s.\n' "$uv_version" >&2
  exit 1
fi

node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" -ne 22 ]; then
  printf 'Node.js 22 is required by the Python Worker toolchain; found %s.\n' "$(node --version)" >&2
  exit 1
fi

require_value() {
  name=$1
  eval "value=\${$name:-}"
  [ -n "$value" ] || {
    printf 'Missing required environment variable: %s\n' "$name" >&2
    exit 1
  }
}

require_value CLOUDFLARE_ACCOUNT_ID
require_value CLOUDFLARE_API_TOKEN
require_value OPEN_SESSION_D1_DATABASE_NAME
require_value OPEN_SESSION_D1_DATABASE_ID
require_value OPEN_SESSION_R2_BUCKET_NAME
require_value OPEN_SESSION_PUBLIC_URL
require_value OPEN_SESSION_EMAIL_SENDER_ADDRESS
require_value OPEN_SESSION_SESSION_SECRET

email_enabled=${OPEN_SESSION_EMAIL_ENABLED:-false}
ai_enabled=${OPEN_SESSION_AI_REVIEW_ENABLED:-false}
ai_model=${OPEN_SESSION_AI_REVIEW_MODEL:-gpt-5.6-luna}

case "$OPEN_SESSION_PUBLIC_URL" in
  https://*) ;;
  *) printf 'OPEN_SESSION_PUBLIC_URL must use https://\n' >&2; exit 1 ;;
esac

for value in "$CLOUDFLARE_ACCOUNT_ID" "$OPEN_SESSION_D1_DATABASE_NAME" "$OPEN_SESSION_D1_DATABASE_ID" \
  "$OPEN_SESSION_R2_BUCKET_NAME" "$OPEN_SESSION_PUBLIC_URL" "$OPEN_SESSION_EMAIL_SENDER_ADDRESS" \
  "$OPEN_SESSION_SESSION_SECRET" "${OPEN_SESSION_EMAIL_API_TOKEN:-$CLOUDFLARE_API_TOKEN}" \
  "${OPEN_SESSION_OPENAI_API_KEY:-}" "${OPEN_SESSION_COMPOSIO_API_KEY:-}" \
  "$email_enabled" "$ai_enabled" "$ai_model"; do
  case "$value" in
    *'"'*|*'\\'*) printf 'Cloudflare deployment values cannot contain quotes or backslashes.\n' >&2; exit 1 ;;
  esac
done

rm -rf "$build_dir"
mkdir -p "$build_dir"
cp -R "$api_dir/app" "$build_dir/app"
cp "$api_dir/worker.py" "$cloudflare_dir/pyproject.toml" "$cloudflare_dir/uv.lock" "$build_dir/"

sed \
  -e "s|__D1_DATABASE_NAME__|$OPEN_SESSION_D1_DATABASE_NAME|g" \
  -e "s|__D1_DATABASE_ID__|$OPEN_SESSION_D1_DATABASE_ID|g" \
  -e "s|__R2_BUCKET_NAME__|$OPEN_SESSION_R2_BUCKET_NAME|g" \
  -e "s|__CLOUDFLARE_ACCOUNT_ID__|$CLOUDFLARE_ACCOUNT_ID|g" \
  -e "s|__PUBLIC_URL__|$OPEN_SESSION_PUBLIC_URL|g" \
  -e "s|__EMAIL_SENDER_ADDRESS__|$OPEN_SESSION_EMAIL_SENDER_ADDRESS|g" \
  -e "s|__EMAIL_ENABLED__|$email_enabled|g" \
  -e "s|__AI_REVIEW_ENABLED__|$ai_enabled|g" \
  -e "s|__AI_REVIEW_MODEL__|$ai_model|g" \
  "$template" > "$generated"

cd "$project_root"
pnpm install --frozen-lockfile
pnpm --filter @opensession/web build

cd "$api_dir"
uv sync --frozen

# D1 is migrated through its authenticated SQL API during deployment. Runtime
# requests use the faster native DB binding and do not receive this API token.
OPEN_SESSION_DATABASE_URL="cloudflare_d1://$CLOUDFLARE_ACCOUNT_ID:$CLOUDFLARE_API_TOKEN@$OPEN_SESSION_D1_DATABASE_ID" \
  OPEN_SESSION_ENVIRONMENT=production \
  uv run python -m app.jobs.cloudflare_migrate

secret_file=$(mktemp)
trap 'rm -f "$secret_file"' EXIT HUP INT TERM
email_api_token=${OPEN_SESSION_EMAIL_API_TOKEN:-$CLOUDFLARE_API_TOKEN}
{
  printf '{\n'
  printf '  "OPEN_SESSION_SESSION_SECRET": "%s",\n' "$OPEN_SESSION_SESSION_SECRET"
  printf '  "OPEN_SESSION_CLOUDFLARE_API_TOKEN": "%s"' "$email_api_token"
  if [ -n "${OPEN_SESSION_OPENAI_API_KEY:-}" ]; then
    printf ',\n  "OPEN_SESSION_OPENAI_API_KEY": "%s"' "$OPEN_SESSION_OPENAI_API_KEY"
  fi
  if [ -n "${OPEN_SESSION_COMPOSIO_API_KEY:-}" ]; then
    printf ',\n  "OPEN_SESSION_COMPOSIO_API_KEY": "%s"' "$OPEN_SESSION_COMPOSIO_API_KEY"
  fi
  printf '\n}\n'
} > "$secret_file"

cd "$build_dir"
"$api_dir/.venv/bin/pywrangler" sync --force
# pywrangler needs this build environment while resolving packages, but
# Wrangler's default Python glob would otherwise upload it as application code.
# The deployable packages are already materialized in python_modules.
rm -rf "$build_dir/.venv-workers"
npx --yes wrangler@latest secret bulk "$secret_file" --config "$generated"
npx --yes wrangler@latest deploy --config "$generated"

printf '%s\n' "Cloudflare deployment completed: $OPEN_SESSION_PUBLIC_URL"
