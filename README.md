# Open Session

A fast, open-source conference program operating system covering the full lifecycle:

**Event setup → CFP → submission → evaluation → accept/decline → speaker onboarding → communications → sessions → agenda → calendar invites**

Built from the build plan in [`open_sessionboard_product_plan.md`](./open_sessionboard_product_plan.md). The plan specifies Cloudflare Workers/Hono; the backend is implemented with **Python FastAPI** (everything else — data model, routes, service boundaries, phases — follows the plan).

## Stack

- **Backend** — Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic v2, SQLite (local) / Postgres (prod), OpenAPI docs at `/docs`
- **Frontend** — React 19, Vite, React Router, Tailwind CSS v4, shadcn-style components, TanStack Query
- **Shared** — `@opensession/schemas` (Zod models mirroring the Pydantic contract)

The domain layer depends on repository interfaces (`app/repositories/`), so the SQLAlchemy adapter can be swapped without rewriting the application.

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

Email delivery is disabled by default, so magic-login codes are returned by the API and printed to the server log. Set `OPEN_SESSION_EMAIL_ENABLED=true` + SMTP settings (e.g. Mailpit on `localhost:1025`) in `apps/api/.env` to test real delivery and .ics calendar invites. See `apps/api/.env.example`.

### Tests / checks

```bash
cd apps/api && uv run pytest && uv run ruff check .
pnpm --filter @opensession/web typecheck
```

## Production operations

Production startup does not create or mutate database tables. Run migrations as
a release step before starting the API:

```bash
cd apps/api
OPEN_SESSION_ENVIRONMENT=production uv run alembic upgrade head
```

- Back up the database and `OPEN_SESSION_FILES_STORAGE_DIR` together; restore
  both to the same point in time so file metadata and bytes remain consistent.
- Set a strong `OPEN_SESSION_SESSION_SECRET`, an explicit production database
  URL, and only the deployed web origins in `OPEN_SESSION_CORS_ORIGINS`.
- Configure SMTP or Cloudflare email through `apps/api/.env.example`; keep
  provider, OpenAI, and calendar OAuth secrets server-side.
- Run `alembic current`, `/health`, and an evaluator-persona smoke test after a
  restore or deployment. Evaluation mode must remain disabled outside the demo
  environment.

## What's implemented (all phases)

- **Auth (§3, §22)** — passwordless magic-link codes, signed HTTP-only session cookies, event role bindings (`owner/admin/reviewer/speaker`), Bearer **API keys** with per-resource scopes, operational tables (`auth_sessions`, `login_tokens`, `role_bindings`, `api_keys`, `idempotency_keys`, `email_job_receipts`, `audit_events`).
- **Events & program config (§6–7)** — event CRUD + create wizard payload, tracks/categories (incl. `serial_schedule`), tags, session formats, rooms.
- **CFP forms (§8)** — full form builder data model (sections/fields, participant roles, conditional rules, routing rules), publish/close/duplicate, server-side validation.
- **Public CFP (§9)** — welcome schema, passwordless account, draft → edit → submit with conditional-aware validation, category routing, submission-limit enforcement, confirmation email.
- **Submissions (§10, §20)** — status tabs/filters, manual abstracts, decision endpoint with the §20 state machine, bulk decisions, accept flow (creates session, marks speakers, generates tasks, sends email), CSV export.
- **Evaluations (§11)** — plans with scope + weighted criteria, reviewer assignment, reviewer portal, draft/submit reviews, aggregate scoring.
- **Speakers & portal (§12–13)** — speakers list with readiness, self-service profile/submissions/tasks/sessions/files endpoints (`/api/v1/me/*`).
- **Tasks (§14)** — templates, assignment generation on acceptance, completion (updates readiness), reminder job (idempotent via `email_job_receipts`).
- **Files (§15)** — upload-intent → content → download → delete, local storage adapter, per-person/per-event authorization.
- **Communications (§16–17)** — seeded email templates with `{{merge.vars}}`, automations (trigger → condition → template), communication history, manual sends, iCalendar (`.ics`) invites with stable UID + `SEQUENCE`.
- **Sessions & agenda (§18–19)** — manual sessions, accepted-submission conversion, scheduling with the conflict engine (room/speaker/track collisions, event boundaries, invalid durations), agenda + conflicts endpoints, schedule emails with ICS.
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
