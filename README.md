# Open Session

A fast, open-source conference program operating system covering the full lifecycle:

**Event setup → CFP → submission → evaluation → accept/decline → speaker onboarding → communications → sessions → agenda → calendar invites**

The same application can run as a self-contained Docker installation on a VPS
or on Cloudflare using a Python Worker, D1, R2, Cron Triggers, and Workers
Static Assets.

## Stack

- **Backend** — Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic v2, SQLite on a VPS or D1 on Cloudflare, OpenAPI docs at `/docs`
- **Frontend** — React 19, Vite, React Router, Tailwind CSS v4, shadcn-style components, TanStack Query
- **Files** — local persistent volume on a VPS or R2 on Cloudflare
- **Shared** — `@opensession/schemas` (Zod models mirroring the Pydantic contract)

## Repository structure

```
apps/
  web/        React/Vite application (TypeScript)
  api/        FastAPI backend (Python, uv)
packages/
  schemas/    shared Zod models
  ui/         shared UI components
```

## Running locally

Prereqs: Node 20+, pnpm, Python 3.12+, uv.

```bash
pnpm install

# Terminal 1 — API (http://127.0.0.1:8000, docs at /docs)
pnpm dev:api

# Terminal 2 — web app (http://localhost:5173)
pnpm dev
```

### Signing in (development)

Open Session uses local passwordless authentication: enter an email address, then
enter the short-lived, single-use code sent to that address. In development,
email delivery is disabled by default and the code is returned by the API and
printed to the server log. Set `OPEN_SESSION_EMAIL_ENABLED=true` plus the
Cloudflare Email Service or SMTP settings in `apps/api/.env` to deliver real
messages. See `apps/api/.env.example`.

The first authenticated user is guided through creating the deployment's one
organization and becomes its owner. Owners and admins can then invite teammates
from **Organization settings → Team & invitations**. Invitations are bound to
the invited email address, expire after 14 days, and still require a one-time
sign-in code before access is granted.

### Tests / checks

```bash
cd apps/api && uv run pytest && uv run ruff check .
pnpm --filter @opensession/web typecheck
```

## Deploy on a VPS

The simplest production path is the Docker installation. It runs the web proxy,
API, and hourly reminder scheduler and persists SQLite plus uploaded files in a
named volume.

```bash
curl -fsSL https://raw.githubusercontent.com/AjayK47/Open-session/main/deploy/install.sh | sh
```

For a source checkout, copy `deploy/.env.production.example` to `.env`, fill in
the secrets, then run:

```bash
docker compose -f compose.yaml -f compose.build.yaml --env-file .env up -d --build
```

## Deploy on Cloudflare

The Cloudflare target keeps the FastAPI application and maps its infrastructure
to native services:

- Python Worker for HTTP requests
- D1 binding for relational data
- R2 binding for uploads, headshots, and supporting files
- Cron Trigger for idempotent speaker task reminders
- Workers Static Assets for the React application

Cloudflare's Python Worker toolchain currently requires Node.js 22 and `uv` 0.8
or newer. This Worker bundles to about 8.9 MB compressed, so it requires a paid
Workers plan. Create the D1 database and R2 bucket, copy
`deploy/cloudflare/.env.example`, export its values, and run
`./deploy/cloudflare/deploy.sh`.

See the [deployment guides](https://open-session.mintlify.site/introduction) for
the complete setup.

## Production operations

Production startup does not create or mutate database tables. Run migrations as
a release step before starting the API:

```bash
cd apps/api
OPEN_SESSION_ENVIRONMENT=production uv run alembic upgrade head
```

- On a VPS, back up the database and `OPEN_SESSION_FILES_STORAGE_DIR` together;
  restore both to the same point in time so file metadata and bytes remain
  consistent.
- Set a strong `OPEN_SESSION_SESSION_SECRET`, an explicit production database
  URL, and only the deployed web origins in `OPEN_SESSION_CORS_ORIGINS`.
- Configure SMTP or Cloudflare email through `apps/api/.env.example`; keep
  provider, OpenAI, and Composio secrets server-side.
- Run `alembic current`, `/health`, and an evaluator-persona smoke test after a
  restore or deployment. Evaluation mode must remain disabled outside the demo
  environment.

<details>
<summary>D1 transaction note</summary>

The D1 SQLAlchemy adapter uses D1's request/binding APIs, where statements are
auto-committed. Multi-statement service operations therefore do not have the
same rollback guarantee as SQLite on the VPS target. The normal application
flows are supported, but the VPS target is the conservative choice when strict
multi-statement atomicity is more important than Cloudflare-native hosting.

</details>

## What's implemented (all phases)

- **Auth & organization (§3, §22)** — local passwordless email codes, hashed single-use login tokens, revocable signed HTTP-only sessions, first-run organization onboarding, owner/admin/member roles, email-bound team invitations, event role bindings (`owner/admin/reviewer/speaker`), and Bearer **API keys** with per-resource scopes.
- **Events & program config (§6–7)** — event CRUD + create wizard payload, tracks/categories (incl. `serial_schedule`), tags, session formats, rooms.
- **CFP forms (§8)** — full form builder data model (sections/fields, participant roles, conditional rules, routing rules), publish/close/duplicate, server-side validation.
- **Public CFP (§9)** — welcome schema, passwordless account, draft → edit → submit with conditional-aware validation, category routing, submission-limit enforcement, confirmation email.
- **Submissions (§10, §20)** — status tabs/filters, manual abstracts, decision endpoint with the §20 state machine, bulk decisions, accept flow (creates session, marks speakers, generates tasks, sends email), CSV export.
- **Evaluations (§11)** — plans with scope + weighted criteria, reviewer assignment, reviewer portal, draft/submit reviews, aggregate scoring.
- **Speakers & portal (§12–13)** — speakers list with readiness, self-service profile/submissions/tasks/sessions/files endpoints (`/api/v1/me/*`).
- **Tasks (§14)** — templates, assignment generation on acceptance, completion (updates readiness), reminder job (idempotent via `email_job_receipts`).
- **Files (§15)** — upload-intent → content → download → delete, local storage adapter, per-person/per-event authorization.
- **Communications (§16–17)** — responsive branded HTML/plain-text transactional emails, seeded event templates with `{{merge.vars}}`, automations (trigger → condition → template), communication history, manual sends, iCalendar (`.ics`) invites with stable UID + `SEQUENCE`.
- **Sessions & agenda (§18–19)** — manual sessions, accepted-submission conversion, scheduling with the conflict engine (room/speaker/track collisions, event boundaries, invalid durations), agenda + conflicts endpoints, provider-independent ICS invitations, and optional one-way speaker calendar synchronization through Composio managed auth.
- **Dashboard (§6.3, §14)** — metrics and real-time onboarding readiness.
- **Ops (§24)** — saved views, team management, CSV, OpenAPI.

## Demo (matches plan §29)

1. Create an event with tracks/rooms/formats.
2. Build + publish a CFP with a conditional rule and routing rule.
3. Submit publicly as a speaker (draft → submit, confirmation email recorded).
4. Create an evaluation plan, assign a reviewer, score it.
5. Accept → a Session is created, the speaker is marked accepted, onboarding tasks are generated, and an acceptance email is recorded.
6. The speaker completes a task in the portal → the onboarding dashboard updates.
7. Schedule sessions → a room/speaker conflict is blocked → resolve it → agenda + ICS invites.
8. Check metrics, API keys, and CSV export.
