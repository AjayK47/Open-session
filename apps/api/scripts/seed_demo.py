"""Seed a demo conference over the public HTTP API.

Why HTTP and not direct SQLAlchemy inserts: every row here goes through the same
validation, RBAC and side effects (reference codes, submission events, audit log)
that a real organizer's clicks would, so the demo data can't drift into states the
app itself would never produce.

Usage:
    uv run python scripts/seed_demo.py [--api http://localhost:8000] [--owner you@example.com]

Idempotency: the event slug is fixed. Re-running detects and reuses the existing
event instead of creating duplicates. Use a clean evaluation database when a
full reset to the original fixture state is required.
"""

from __future__ import annotations

import argparse
import base64
import sys
from typing import Any

import httpx

TRACKS = [
    ("AI Engineering", "oklch(0.633 0.191 256)"),
    ("Platform & Infra", "oklch(0.723 0.174 152)"),
    ("Developer Experience", "oklch(0.769 0.157 63.5)"),
]
ROOMS = [("Main Stage", 800), ("Room 2A", 180), ("Room 2B", 180), ("Workshop Lab", 100)]
FORMATS = [
    ("Keynote (45 min)", 45),
    ("Talk (30 min)", 30),
    ("Lightning Talk (10 min)", 10),
    ("Workshop (120 min)", 120),
    ("Panel (45 min)", 45),
]
TAGS = ["Build systems", "AI agents", "Documentation", "Evals", "Platform engineering"]

# (title, track, format, status, speaker first, last, company, job title)
SUBMISSIONS = [
    (
        "Monorepo Build Systems: A Production Playbook",
        "Platform & Infra", "Talk (30 min)", "accepted",
        "Priya", "Raman", "Latticework Systems", "Principal Engineer",
    ),
    (
        "Verification-First AI Pair Programming",
        "AI Engineering", "Talk (30 min)", "accepted",
        "Marcus", "Okafor", "Cloudreach Labs", "Staff Developer Advocate",
    ),
    (
        "Documentation Retrieval in Production",
        "Developer Experience", "Lightning Talk (10 min)", "pending_review",
        "Elena", "Vasquez", "Answerable Docs", "Developer Experience Lead",
    ),
    (
        "The Future of Agent Orchestration", "AI Engineering", "Panel (45 min)", "pending_review",
        "Margaret", "Hamilton", "Apollo Systems", "Director of Engineering",
    ),
    (
        "Cost-Optimizing Your Inference Stack", "Platform & Infra", "Talk (30 min)", "accept_queue",
        "Barbara", "Liskov", "Substitution Inc", "Distinguished Engineer",
    ),
    (
        "Vector Search Isn't Enough", "AI Engineering", "Workshop (120 min)", "decline_queue",
        "Radia", "Perlman", "Spanning Tree", "Network Architect",
    ),
    (
        "Building a Prompt Injection Firewall", "AI Engineering", "Talk (30 min)", "declined",
        "Edsger", "Dijkstra", "Shortest Path", "Professor",
    ),
]


class Seeder:
    def __init__(self, api: str, owner: str) -> None:
        self.client = httpx.Client(base_url=api, timeout=30.0)
        self.owner = owner

    def login(self) -> None:
        body = self.client.post("/api/v1/auth/request-code", json={"email": self.owner}).json()
        code = body.get("dev_code")
        if not code:
            raise SystemExit(
                "The API did not return a dev_code — it is not running in development mode, "
                "so this script cannot sign in."
            )
        self._post(
            "/api/v1/auth/verify",
            {"email": self.owner, "code": code, "first_name": "Jordan", "last_name": "Alvarez"},
        )

    def _post(self, path: str, json: Any) -> Any:
        response = self.client.post(path, json=json)
        if response.status_code >= 400:
            raise SystemExit(f"POST {path} failed [{response.status_code}]: {response.text}")
        return response.json()

    def _patch(self, path: str, json: Any) -> Any:
        response = self.client.patch(path, json=json)
        if response.status_code >= 400:
            raise SystemExit(f"PATCH {path} failed [{response.status_code}]: {response.text}")
        return response.json()

    def _seed_cfp_form(self, event_id: str, formats: dict[str, str]) -> None:
        """The public call for speakers, published so /submit/<slug>/cfp works.

        `system_field` is what maps an answer onto a real column (title,
        description, track, …); fields without one land in `custom_answers`.
        """
        workshop_format_id = formats.get("Workshop (120 min)", "")
        form = self._post(
            f"/api/v1/events/{event_id}/forms",
            {
                "internal_name": "Call for Speakers 2026",
                "public_title": "Call for Speakers",
                "slug": "cfp",
                "submission_type": "abstract",
                # 23:59 on Sep 30 in the event's own timezone, not in UTC — the deadline is
                # shown to speakers in event time, and 23:59Z would read as 4:59 PM.
                # April 30 at 23:59 in America/Los_Angeles, matching the
                # evaluator fixture rather than merely using an arbitrary
                # future deadline.
                "close_at": "2027-05-01T06:59:00Z",
                "submission_limit": 3,
                "participant_roles": [{"role": "speaker", "min": 1, "max": 4}],
                "success_message_html": (
                    "<p>Thanks for submitting to DevFlow Conf 2027. Our program committee reviews "
                    "every proposal — you'll hear from us by <strong>April 15</strong>.</p>"
                ),
                # Only ask about prerequisites when the format is a workshop.
                #
                # Two rules, not one: the engine treats any field a rule does not
                # mention as visible, so hiding needs an explicit `not_equals`
                # rule. That also gives the right initial state — nothing chosen
                # yet is "not workshop", so the field starts hidden.
                "conditional_rules": [
                    {
                        "field": "format",
                        "operator": "not_equals",
                        "value": workshop_format_id,
                        "actions": [{"kind": "hide", "target": "workshop_prerequisites"}],
                    },
                    {
                        "field": "format",
                        "operator": "equals",
                        "value": workshop_format_id,
                        "actions": [{"kind": "require", "target": "workshop_prerequisites"}],
                    },
                ],
                "sections": [
                    {
                        "key": "session",
                        "title": "Your session",
                        "instructions": "Tell us what you'd like to present and who it's for.",
                        "fields": [
                            {
                                "key": "title",
                                "label": "Session title",
                                "field_type": "short_text",
                                "system_field": "title",
                                "required": True,
                                "max_length": 120,
                                "placeholder": "Building Production AI Agents",
                            },
                            {
                                "key": "description",
                                "label": "Abstract",
                                "field_type": "long_text",
                                "system_field": "description",
                                "required": True,
                                "help_text": "200–400 words. What will attendees walk away able to do?",
                            },
                            {
                                "key": "track",
                                "label": "Track",
                                "field_type": "dropdown",
                                "system_field": "track",
                                "required": True,
                            },
                            {
                                "key": "format",
                                "label": "Format",
                                "field_type": "dropdown",
                                "system_field": "format",
                                "required": True,
                            },
                            {
                                "key": "level",
                                "label": "Audience level",
                                "field_type": "dropdown",
                                "system_field": "level",
                                "required": True,
                            },
                        ],
                    },
                    {
                        "key": "details",
                        "title": "A few more details",
                        "fields": [
                            {
                                "key": "key_takeaway",
                                "label": "Key takeaway",
                                "field_type": "short_text",
                                "required": True,
                                "help_text": "What is the single most useful thing attendees will learn?",
                            },
                            {
                                "key": "speaker_bio",
                                "label": "Speaker bio",
                                "field_type": "long_text",
                                "help_text": "A short biography for the program and review team.",
                            },
                            {
                                "key": "presented_before",
                                "label": "Have you presented this talk before?",
                                "field_type": "radio",
                                "options": ["No, this is new", "Yes, at another event", "Yes, online only"],
                                "required": True,
                            },
                            {
                                "key": "recording_url",
                                "label": "Link to a past talk (optional)",
                                "field_type": "url",
                                "placeholder": "https://",
                            },
                            {
                                "key": "workshop_prerequisites",
                                "label": "Workshop prerequisites",
                                "field_type": "long_text",
                                "help_text": "What should attendees install or know beforehand?",
                            },
                        ],
                    },
                ],
            },
        )
        self._post(f"/api/v1/forms/{form['id']}/publish", {})

    def _seed_evaluations(self, event_id: str) -> None:
        """A review round with two reviewers and some scores already in.

        Without this the Evaluations page is empty on a fresh demo, which hides
        the whole review workflow — the part the brief spends the most time on.
        """
        plan = self._post(
            f"/api/v1/events/{event_id}/evaluation-plans",
            {
                "name": "Program committee — round 1",
                "instructions": "Score each proposal on relevance, depth, and speaker readiness.",
                "criteria": [
                    {"key": "relevance", "label": "Relevance to the audience", "scale_max": 5, "weight": 1.5},
                    {"key": "depth", "label": "Technical depth", "scale_max": 5, "weight": 1.0},
                    {"key": "readiness", "label": "Speaker readiness", "scale_max": 5, "weight": 0.5},
                ],
                "reviews_required": 2,
                "blind_review": True,
            },
        )

        # Keep the evaluator's Sam Whitfield persona clean. ABS-05 explicitly
        # checks that his queue contains exactly the subset assigned during the
        # scenario; decorative seed reviews on that account would contaminate
        # the evidence even though assignment authorization is correct.
        reviewers = ["demo.reviewer.one@example.com", "demo.reviewer.two@example.com"]
        assigned = self._post(
            f"/api/v1/evaluation-plans/{plan['id']}/assignments",
            {"reviewers": reviewers},
        )
        if not isinstance(assigned, dict):
            return

        # Fill in one reviewer's scores so the page shows aggregates rather than
        # a wall of "not yet reviewed".
        scores = [
            ({"relevance": 5, "depth": 4, "readiness": 5}, "Strong, concrete, and well scoped."),
            ({"relevance": 4, "depth": 5, "readiness": 3}, "Deep material; ask for a dry run."),
            ({"relevance": 3, "depth": 3, "readiness": 4}, "Solid but overlaps with two other talks."),
        ]
        self._login_as(reviewers[0])
        mine = self.client.get("/api/v1/reviewer/assignments").json()
        for assignment, (score, comment) in zip(mine, scores, strict=False):
            self.client.post(
                f"/api/v1/review-assignments/{assignment['id']}/review",
                json={"scores": score, "comments": comment, "submit": True},
            )
        self._login_as(self.owner)

    def _login_as(self, email: str, first_name: str | None = None, last_name: str | None = None) -> None:
        code = self.client.post("/api/v1/auth/request-code", json={"email": email}).json().get("dev_code")
        if code:
            self.client.post(
                "/api/v1/auth/verify",
                json={"email": email, "code": code, "first_name": first_name, "last_name": last_name},
            )

    def _seed_schedule_and_files(self, event_id: str) -> None:
        sessions = self.client.get(f"/api/v1/events/{event_id}/sessions").json()
        rooms = self.client.get(f"/api/v1/events/{event_id}/rooms").json()
        tracks = {item["name"]: item["id"] for item in self.client.get(f"/api/v1/events/{event_id}/tracks").json()}
        formats = {item["name"]: item["id"] for item in self.client.get(f"/api/v1/events/{event_id}/formats").json()}

        # The public-widget evaluator samples at least three cards and switches
        # across all three event days. Keep the submission states useful for the
        # review scenarios, and add standalone program sessions for the extra
        # public coverage instead of accepting those proposals behind the user's
        # back.
        extras = [
            {
                "title": "Retrieval-Grounded Docs: Production Lessons",
                "description": (
                    "A production-focused tour of retrieval-grounded documentation: ingestion, citations, "
                    "evaluation sets, failure analysis, and the operational practices that keep answers current. "
                    "Attendees leave with a reference architecture and a concrete rollout checklist."
                ),
                "track_id": tracks.get("Developer Experience"),
                "format_id": formats.get("Lightning Talk (10 min)"),
                "duration_minutes": 10,
                "participants": [
                    {
                        "email": "elena.vasquez@example.com",
                        "role": "speaker",
                        "first_name": "Elena",
                        "last_name": "Vasquez",
                        "company": "Answerable Docs",
                        "job_title": "Developer Experience Lead",
                    }
                ],
            },
            {
                "title": "Operating Agents: Production Q&A",
                "description": (
                    "A rapid-fire field report on operating agents in production, followed by audience questions "
                    "about observability, guardrails, evaluation drift, and incident response. Concrete examples "
                    "show what teams should measure before expanding an agent deployment."
                ),
                "track_id": tracks.get("AI Engineering"),
                "format_id": formats.get("Lightning Talk (10 min)"),
                "duration_minutes": 10,
                "participants": [
                    {
                        "email": "sbek-speaker2@example.com",
                        "role": "speaker",
                        "first_name": "Marcus",
                        "last_name": "Okafor",
                        "company": "Cloudreach Labs",
                        "job_title": "Staff Developer Advocate",
                    }
                ],
            },
        ]
        existing_titles = {session["title"] for session in sessions}
        for extra in extras:
            if extra["title"] not in existing_titles:
                self._post(f"/api/v1/events/{event_id}/sessions", extra)
        sessions = self.client.get(f"/api/v1/events/{event_id}/sessions").json()

        if len(sessions) >= 4 and len(rooms) >= 2:
            schedule_by_title = {
                "Monorepo Build Systems: A Production Playbook": (
                    rooms[1]["id"], "2027-05-12T17:00:00Z", "2027-05-12T17:30:00Z"
                ),
                "Verification-First AI Pair Programming": (
                    rooms[0]["id"], "2027-05-12T18:00:00Z", "2027-05-12T18:30:00Z"
                ),
                "Retrieval-Grounded Docs: Production Lessons": (
                    rooms[1]["id"], "2027-05-13T18:00:00Z", "2027-05-13T18:10:00Z"
                ),
                "Operating Agents: Production Q&A": (
                    rooms[0]["id"], "2027-05-14T19:00:00Z", "2027-05-14T19:10:00Z"
                ),
            }
            for session in sessions:
                slot = schedule_by_title.get(session["title"])
                if not slot:
                    continue
                room_id, starts_at, ends_at = slot
                self._patch(
                    f"/api/v1/sessions/{session['id']}/schedule",
                    {"room_id": room_id, "starts_at": starts_at, "ends_at": ends_at},
                )
            self._post(f"/api/v1/events/{event_id}/agenda/publish", {})

            primary_session = next(
                session for session in sessions if session["title"] == "Monorepo Build Systems: A Production Playbook"
            )
            participant = primary_session.get("participants", [{}])[0]
            pdf = b"%PDF-1.4\n% Open Session deterministic demo slides\n%%EOF\n"
            intent = self._post(
                f"/api/v1/events/{event_id}/files/upload-intent",
                {
                    "filename": "priya-raman-final-slides.pdf",
                    "content_type": "application/pdf",
                    "size_bytes": len(pdf),
                    "file_type": "slides",
                    "person_id": participant.get("person_id"),
                    "session_id": primary_session["id"],
                },
            )
            upload = self.client.post(intent["upload_url"], content=pdf, headers={"Content-Type": "application/pdf"})
            if upload.status_code >= 400:
                raise SystemExit(f"Slide upload failed [{upload.status_code}]: {upload.text}")

            # A real 256x256 avatar, not a 1x1 pixel: the public widgets render
            # headshots at up to 96px, and a stretched single pixel reads as a
            # broken image rather than a photo.
            headshot = base64.b64decode(
                "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAADdklEQVR42u3TQQ2AMAAEwbpDASJqmxdPJOCBpA+6k6yCy804"
                "zillGyYQABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgAS"
                "ABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgACwAoCQAJAi7ru51umAyB3ehgA8HsSAHB9DABwfQwAcH0MAHB9"
                "DADwfgYAcH0MAPB+BgDwfgYA8H4GAHB9DADwfgYAAAAAALyfAQC8nwEAvJ8BALyfAQAAAACA+vsZAKD+fgYAAAAAAMLvZwAA"
                "AAAAIPx+BgAAAAAAwu9nAAAAAPD+fAAAAAAAAAAAgPczAAAAAAAAAAAAAAAAAN7PAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
                "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwID3AwAAAAAAAAAAAAAAAAPeDwAAAAAAAAAA"
                "MOD9AAAAAAAMeD8AAAAAAAPeDwAAAADAgPcDAAAAADDg/QC4PgYAeD8DAHg/AwC4PgYAeD8DAHg/AwB4PwNpAC7OQBeAczPQ"
                "BeDWDHQBODQDXQCuzEAXgBMz0AXgvgx0ATguA10ALssAAAIgCcBZGegCcFMGugAclAEABEASgGsy0AXglAx0AbgjAwAIgCQA"
                "R2SgC8AFGQBAACQBOB8DAAiAJAC3Y6ALwOEYAEAAJAG4GgMACIAkACdjAAABkATgXgwAIACSAByLAQAEQBKASzEAgABIAnAm"
                "BgAQAEkAbsQAAAIAAAFQA+BADAAgAJIAXIcBAAQAAAKgBsBpGABAAAAgAGoA3IUBAAQAAAKgBsBRGABAAAAgAGoAXIQBAAQA"
                "AAIAAAEQAuAcDAAgAAAQAAAIgBAAt2AAAAEAgAAAQAAAIAAaAByCAQAEAAACAAABAIAAAEAAbA/AFRgAQAAAIAAAEAAACAAA"
                "BAAAAmBnAE7AAAACAAABAIAAAEAAACAAABAAAAgAAAQAAAIAAAEAgAAAQAAAIAAAEAAACAAABAAAAgAAAQCAAABAAAAgAAAQ"
                "AAAIAAAEAAACAAABAIAAAEAAACAAABAAAAgAAAQAAAIAAAEAgAAAQAAwoN+/HwABAIAAAEAAAKAcgBfubunTC3dRIQAAAABJ"
                "RU5ErkJggg=="
            )
            headshot_intent = self._post(
                f"/api/v1/events/{event_id}/files/upload-intent",
                {
                    "filename": "priya-raman.png",
                    "content_type": "image/png",
                    "size_bytes": len(headshot),
                    "file_type": "headshot",
                    "person_id": participant.get("person_id"),
                },
            )
            uploaded_headshot = self.client.post(
                headshot_intent["upload_url"], content=headshot, headers={"Content-Type": "image/png"}
            )
            if uploaded_headshot.status_code >= 400:
                raise SystemExit(
                    f"Headshot upload failed [{uploaded_headshot.status_code}]: {uploaded_headshot.text}"
                )

        # Leave one intentionally unapproved session so the content gate and
        # public-widget exclusion have a visible fixture to test.
        self._post(
            f"/api/v1/events/{event_id}/sessions",
            {
                "title": "Unapproved program preview",
                "description": "Internal draft used to verify the public approval gate.",
                "duration_minutes": 30,
            },
        )

    def run(self, slug: str) -> str:
        self.login()
        existing = next((item for item in self.client.get("/api/v1/events").json() if item["slug"] == slug), None)
        if existing:
            print(f"Demo event already exists: {existing['id']} (slug: {slug}). No duplicate was created.")
            return existing["id"]

        # Provision the fixture personas before their submissions/assignments are
        # created. The later upserts attach profile data and event access to these
        # exact user identities.
        self._login_as("sbek-speaker@example.com", "Priya", "Raman")
        self._login_as("sbek-speaker2@example.com", "Marcus", "Okafor")
        self._login_as("sbek-reviewer@example.com", "Sam", "Whitfield")
        self._login_as(self.owner, "Jordan", "Alvarez")
        event = self._post(
            "/api/v1/events",
            {
                "name": "DevFlow Conf 2027",
                "slug": slug,
                "type": "conference",
                "timezone": "America/Los_Angeles",
                "location": "Moscone West, San Francisco, CA",
                "starts_at": "2027-05-12T16:00:00Z",
                "ends_at": "2027-05-15T01:00:00Z",
                "description": (
                    "A three-day, three-track conference on developer tooling, "
                    "AI-assisted engineering, and platform infrastructure."
                ),
                "program": {
                    "tracks": [{"name": n, "color": c} for n, c in TRACKS],
                    "rooms": [{"name": n, "capacity": c} for n, c in ROOMS],
                    "formats": [{"name": n, "default_duration_minutes": d} for n, d in FORMATS],
                    "tags": [{"name": t} for t in TAGS],
                },
            },
        )
        event_id = event["id"]

        tracks = {t["name"]: t["id"] for t in self.client.get(f"/api/v1/events/{event_id}/tracks").json()}
        formats = {f["name"]: f["id"] for f in self.client.get(f"/api/v1/events/{event_id}/formats").json()}

        self._seed_cfp_form(event_id, formats)
        # The six speaker-onboarding tasks swyx named, plus the two portal forms
        # two of them need — so a freshly seeded demo has real speaker work to show.
        self._post(f"/api/v1/events/{event_id}/task-templates/starter-pack", {})

        fixture_emails = {
            ("Priya", "Raman"): "sbek-speaker@example.com",
            ("Marcus", "Okafor"): "sbek-speaker2@example.com",
        }
        for title, track, fmt, status, first, last, company, job in SUBMISSIONS:
            submission = self._post(
                f"/api/v1/events/{event_id}/submissions",
                {
                    "title": title,
                    "description": f"<p>{title} — a practitioner's walkthrough with real numbers.</p>",
                    "track_id": tracks.get(track),
                    "format_id": formats.get(fmt),
                    "level": "Intermediate",
                    "language": "English",
                    "participants": [
                        {
                            "email": fixture_emails.get(
                                (first, last), f"{first.lower()}.{last.lower()}@example.com"
                            ),
                            "role": "speaker",
                            "first_name": first,
                            "last_name": last,
                            "company": company,
                            "job_title": job,
                        }
                    ],
                },
            )
            # Drive the status through the real decision endpoint rather than
            # writing it on create: accepting is what spawns the session, registers
            # the speaker on the event, and generates their portal tasks. Seeding
            # the status directly produces "accepted" rows with none of that.
            if status not in ("draft", "submitted"):
                self._post(
                    f"/api/v1/submissions/{submission['id']}/decision",
                    {"decision": status, "notify": False},
                )

        speaker_profiles = {
            "sbek-speaker@example.com": {
                "bio": (
                    "Priya Raman is a Principal Engineer at Latticework Systems where she leads the build-tooling "
                    "platform team. She previously maintained the open-source task runner 'gantry' and has spoken "
                    "at over a dozen developer conferences on build systems, CI reliability, and developer "
                    "productivity metrics."
                ),
                "linkedin_url": "https://www.linkedin.com/in/priya-raman-example",
                "x_url": "https://x.com/priyabuilds",
                "custom_fields": {"dietary_requirements": "Vegetarian", "shirt_size": "M"},
            },
            "sbek-speaker2@example.com": {
                "bio": (
                    "Marcus Okafor is a Staff Developer Advocate at Cloudreach Labs focused on AI agents in "
                    "production. He writes the newsletter 'Agents Weekly' and co-organizes the SF AI Tinkerers meetup."
                ),
            },
            "elena.vasquez@example.com": {
                "bio": (
                    "Elena Vasquez leads developer experience at Answerable Docs, where she builds citation-first "
                    "retrieval systems for technical documentation."
                ),
            },
        }
        speakers = self.client.get(f"/api/v1/events/{event_id}/speakers").json()
        for speaker in speakers:
            profile = speaker_profiles.get(speaker["email"])
            if profile:
                self._patch(
                    f"/api/v1/events/{event_id}/speakers/{speaker['person_id']}",
                    profile,
                )

        self._seed_evaluations(event_id)
        self._seed_schedule_and_files(event_id)

        print(f"Seeded event {event_id} (slug: {slug}) with {len(SUBMISSIONS)} submissions.")
        print(f"Organizer:     {self.owner}")
        print(f"Organizer app: /app/events/{event_id}/dashboard")
        print(f"Speaker portal:/portal/{slug}")
        # Seeding signs in several times from one IP (organizer + reviewers), which
        # eats into the magic-code rate limit. Say so, or the first browser login
        # after seeding looks like a bug.
        print()
        print("Note: seeding used several sign-in codes from this IP. If your first")
        print("      browser login is rejected, wait a minute or set")
        print("      OPEN_SESSION_RATE_LIMIT_ENABLED=false for the demo.")
        return event_id


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--owner", default="sbek-organizer@example.com")
    parser.add_argument("--slug", default="devflow-conf-2027")
    args = parser.parse_args()
    Seeder(args.api, args.owner).run(args.slug)
    return 0


if __name__ == "__main__":
    sys.exit(main())
