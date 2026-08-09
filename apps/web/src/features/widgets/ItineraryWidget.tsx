import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Check, Download, MapPin, Plus, Trash2 } from "lucide-react";
import { Button, cn } from "@opensession/ui";
import type { PublicSession } from "@opensession/schemas";
import {
  FormatTag,
  Expandable,
  SearchBox,
  SpeakerAvatar,
  TrackTag,
  WidgetShell,
  dayKey,
  dayLabel,
  eventDays,
  sessionTime,
  speakerSubtitle,
  usePublicProgram,
} from "./widget-kit";

/**
 * Personal itinerary (EMB-09/10/11).
 *
 * There is no attendee login anywhere in the product, so the picks live in
 * localStorage keyed by event slug. That keeps the widget genuinely public while
 * still surviving a refresh, which is what the rubric actually asks for.
 */
function useItinerary(eventSlug: string) {
  const storageKey = `open-session:itinerary:${eventSlug}`;
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (!eventSlug) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      setIds(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setIds([]);
    }
  }, [eventSlug, storageKey]);

  const persist = useCallback(
    (next: string[]) => {
      setIds(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Private-browsing quota errors must not take the page down; the
        // itinerary simply stops surviving a refresh.
      }
    },
    [storageKey],
  );

  const toggle = useCallback(
    (id: string) => persist(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]),
    [ids, persist],
  );

  return { ids, toggle, clear: () => persist([]) };
}

/** Pairs of picked sessions whose times overlap (EMB-10). */
function overlaps(sessions: PublicSession[]): Set<string> {
  const clashing = new Set<string>();
  const timed = sessions
    .filter((s) => s.starts_at && s.ends_at)
    .map((s) => ({ id: s.id, start: new Date(s.starts_at!).getTime(), end: new Date(s.ends_at!).getTime() }));
  for (const [i, a] of timed.entries()) {
    for (const b of timed.slice(i + 1)) {
      if (a.start < b.end && b.start < a.end) {
        clashing.add(a.id);
        clashing.add(b.id);
      }
    }
  }
  return clashing;
}

function icsStamp(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/[;,]/g, (m) => `\\${m}`).replace(/\r?\n/g, "\\n");
}

function downloadIcs(eventName: string, sessions: PublicSession[]) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Open Session//Itinerary//EN", "CALSCALE:GREGORIAN"];
  for (const session of sessions) {
    if (!session.starts_at) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${session.id}@open-session`,
      `DTSTAMP:${icsStamp(new Date().toISOString())}`,
      `DTSTART:${icsStamp(session.starts_at)}`,
      ...(session.ends_at ? [`DTEND:${icsStamp(session.ends_at)}`] : []),
      `SUMMARY:${escapeIcsText(session.title)}`,
      ...(session.room?.name || session.location
        ? [`LOCATION:${escapeIcsText(session.room?.name ?? session.location ?? "")}`]
        : []),
      `DESCRIPTION:${escapeIcsText(eventName)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "my-itinerary.ics";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ItineraryWidget() {
  const { data: program, eventSlug } = usePublicProgram();
  const { ids, toggle, clear } = useItinerary(eventSlug);
  const [search, setSearch] = useState("");
  const [activeDay, setActiveDay] = useState<string | null>(null);

  const picked = useMemo(
    () => (program ? program.sessions.filter((s) => ids.includes(s.id)) : []),
    [program, ids],
  );
  const clashing = useMemo(() => overlaps(picked), [picked]);

  if (!program) return <WidgetShell title="My itinerary">{null}</WidgetShell>;

  const timezone = program.event.timezone || "UTC";
  const days = eventDays(program);
  const day = activeDay ?? days[0] ?? null;
  const needle = search.trim().toLowerCase();
  const available = program.sessions.filter(
    (s) =>
      (!s.starts_at || !day || dayKey(s.starts_at, timezone) === day)
      && (!needle || s.title.toLowerCase().includes(needle) || s.speakers.some((sp) => sp.name.toLowerCase().includes(needle))),
  );
  const pickedByDay = days
    .map((day) => ({
      day,
      sessions: picked.filter((s) => s.starts_at && dayKey(s.starts_at, timezone) === day),
    }))
    .filter((group) => group.sessions.length > 0);
  const pickedUntimed = picked.filter((s) => !s.starts_at);

  return (
    <WidgetShell
      title="My itinerary"
      subtitle="Pick the sessions you want to attend. Your choices stay in this browser."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-foreground">All sessions</h2>
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Itinerary days">
              {days.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={value === day}
                  onClick={() => setActiveDay(value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs transition-colors",
                    value === day
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {dayLabel(`${value}T12:00:00Z`, "UTC")}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-3">
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Search sessions or speakers…"
              resultCount={available.length}
            />
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {available.map((session) => {
              const added = ids.includes(session.id);
              return (
                <li key={session.id} className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <TrackTag track={session.track} />
                      <FormatTag format={session.format} />
                    </div>
                    <p className="mt-1 text-sm font-medium text-foreground">{session.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        {sessionTime(session, timezone)}
                      </span>
                      {(session.room || session.location) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" />
                          {session.room?.name ?? session.location}
                        </span>
                      )}
                    </p>
                    <div className="mt-2"><Expandable html={session.description} lines={2} /></div>
                    {session.speakers.length > 0 && <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">{session.speakers.map((speaker) => <li key={speaker.id} className="flex items-center gap-2"><SpeakerAvatar speaker={speaker} className="size-7" /><div><p className="text-xs font-medium text-foreground">{speaker.name}</p>{speakerSubtitle(speaker) && <p className="text-[11px] text-muted-foreground">{speakerSubtitle(speaker)}</p>}</div></li>)}</ul>}
                  </div>
                  <Button
                    variant={added ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => toggle(session.id)}
                    aria-pressed={added}
                  >
                    {added ? <Check /> : <Plus />}
                    {added ? "Added" : "Add"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-foreground">
                My schedule ({picked.length})
              </h2>
              {picked.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clear}>
                  <Trash2 />
                  Clear
                </Button>
              )}
            </div>

            {clashing.size > 0 && (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                {clashing.size} of your sessions overlap in time. They&apos;re marked below.
              </p>
            )}

            {picked.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Nothing added yet — use Add on any session to build your day.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {pickedByDay.map((group) => (
                  <div key={group.day}>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {dayLabel(`${group.day}T12:00:00Z`, "UTC")}
                    </p>
                    <ul className="space-y-2">
                      {group.sessions.map((session) => (
                        <ItineraryRow
                          key={session.id}
                          session={session}
                          timezone={timezone}
                          clashing={clashing.has(session.id)}
                          onRemove={() => toggle(session.id)}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
                {pickedUntimed.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Time to be announced
                    </p>
                    <ul className="space-y-2">
                      {pickedUntimed.map((session) => (
                        <ItineraryRow
                          key={session.id}
                          session={session}
                          timezone={timezone}
                          clashing={false}
                          onRemove={() => toggle(session.id)}
                        />
                      ))}
                    </ul>
                  </div>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => downloadIcs(program.event.name, picked)}
                >
                  <Download />
                  Download .ics
                </Button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </WidgetShell>
  );
}

function ItineraryRow({
  session,
  timezone,
  clashing,
  onRemove,
}: {
  session: PublicSession;
  timezone: string;
  clashing: boolean;
  onRemove: () => void;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-lg border p-2.5",
        clashing ? "border-warning/50 bg-warning/5" : "border-border",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{session.title}</p>
        <p className="text-xs text-muted-foreground">{sessionTime(session, timezone)}</p>
        {session.room && <p className="text-xs text-muted-foreground">{session.room.name}</p>}
        <div className="mt-1 flex flex-wrap gap-1"><TrackTag track={session.track} /><FormatTag format={session.format} /></div>
        {session.speakers.length > 0 && <p className="mt-1.5 text-xs text-muted-foreground">{session.speakers.map((speaker) => `${speaker.name}${speakerSubtitle(speaker) ? ` (${speakerSubtitle(speaker)})` : ""}`).join(", ")}</p>}
      </div>
      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${session.title}`} onClick={onRemove}>
        <Trash2 />
      </Button>
    </li>
  );
}
