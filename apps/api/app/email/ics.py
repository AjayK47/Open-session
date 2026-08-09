"""Standards-compliant iCalendar generation (plan §17).

Calendar invites are generated locally (no Google/Microsoft OAuth) and attached
to schedule emails. `SEQUENCE` is incremented whenever scheduling changes and a
`METHOD:CANCEL` with the same UID cancels an event.
"""

from collections.abc import Iterable
from datetime import UTC, datetime

from icalendar import Calendar
from icalendar import Event as ICalEvent

ICS_CONTENT_TYPE = "text/calendar; method=REQUEST"


def build_ics(
    *,
    uid: str,
    summary: str,
    start: datetime,
    end: datetime,
    location: str | None = None,
    description: str | None = None,
    organizer_email: str | None = None,
    attendee_emails: Iterable[str] = (),
    sequence: int = 0,
    method: str = "REQUEST",
    status: str = "CONFIRMED",
    dtstamp: datetime | None = None,
) -> bytes:
    cal = Calendar()
    cal.add("prodid", "-//Open Session//Conference Program//EN")
    cal.add("version", "2.0")
    cal.add("METHOD", method)

    event = ICalEvent()
    event.add("uid", uid)
    event.add("summary", summary)
    event.add("dtstart", start)
    event.add("dtend", end)
    event.add("sequence", sequence)
    event.add("status", status)
    event.add("dtstamp", dtstamp or datetime.now(UTC))
    if location:
        event.add("location", location)
    if description:
        event.add("description", description)
    if organizer_email:
        event.add("organizer", f"mailto:{organizer_email}")
    for email in attendee_emails:
        event.add("attendee", f"mailto:{email}", parameters={"CN": email, "ROLE": "REQ-PARTICIPANT"})

    cal.add_component(event)
    return cal.to_ical()
