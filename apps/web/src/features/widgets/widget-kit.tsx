import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router";
import { CalendarDays, MapPin, Search, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage, Input, cn } from "@opensession/ui";
import type { PublicProgram, PublicSession, PublicSpeaker } from "@opensession/schemas";
import { publicApi, filesApi } from "../../api";
import { EventMark } from "../../components/event-identity";
import { sanitizeHtml } from "../../lib/sanitize-html";

/**
 * Shared plumbing for the five public widgets.
 *
 * Every widget reads the *same* `/public/events/{slug}/program` payload, which is
 * what guarantees a session shows identical title, time, room and track wherever
 * it appears (EMB-16) — the alternative, one endpoint per widget, is exactly how
 * those surfaces drift apart.
 */
export function usePublicProgram() {
  const { eventSlug } = useParams<{ eventSlug: string }>();
  const [searchParams] = useSearchParams();
  const query = useQuery({
    queryKey: ["public-program", eventSlug],
    queryFn: () => publicApi.getProgram(eventSlug!),
    enabled: Boolean(eventSlug),
  });
  const trackId = searchParams.get("track");
  const data = useMemo(() => {
    if (!query.data || !trackId) return query.data;
    return { ...query.data, sessions: query.data.sessions.filter((session) => session.track?.id === trackId) };
  }, [query.data, trackId]);
  return { ...query, data, eventSlug: eventSlug ?? "" };
}

/** Formats a session's time range in the *event's* timezone, never the viewer's. */
export function sessionTime(session: PublicSession, timezone: string): string {
  if (!session.starts_at) return "Time to be announced";
  const start = new Date(session.starts_at);
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }).format(start);
  const time = (value: string) =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(
      new Date(value),
    );
  return session.ends_at ? `${date} · ${time(session.starts_at)} – ${time(session.ends_at)}` : `${date} · ${time(session.starts_at)}`;
}

export function dayKey(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(value));
}

export function dayLabel(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }).format(new Date(value));
}

/** Distinct event days, derived from the sessions actually scheduled. */
export function eventDays(program: PublicProgram): string[] {
  const tz = program.event.timezone || "UTC";
  const days = new Set<string>();
  for (const session of program.sessions) {
    if (session.starts_at) days.add(dayKey(session.starts_at, tz));
  }
  return [...days].sort();
}

/** "Nov 10 – 12, 2026" for a multi-day event, a single date for a one-day one. */
export function eventDateRange(program: PublicProgram): string {
  const { starts_at, ends_at, timezone } = program.event;
  if (!starts_at) return "";
  const tz = timezone || "UTC";
  const long = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz });
  if (!ends_at || dayKey(starts_at, tz) === dayKey(ends_at, tz)) return long.format(new Date(starts_at));

  const start = new Date(starts_at);
  const end = new Date(ends_at);
  const sameMonth =
    new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: tz }).format(start) ===
    new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: tz }).format(end);
  // Within one month only the day number changes, so "Nov 10 – 12, 2026" is
  // enough; across months both halves need the month name.
  const endText = sameMonth
    ? new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: tz }).format(end)
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz }).format(end);
  const startText = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz }).format(start);
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: tz }).format(end);
  return `${startText} – ${endText}, ${year}`;
}

export function TrackTag({ track }: { track: PublicSession["track"] }) {
  if (!track) return null;
  const color = track.color || "var(--primary)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`, color }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {track.name}
    </span>
  );
}

export function FormatTag({ format }: { format: PublicSession["format"] }) {
  if (!format) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {format.name}
    </span>
  );
}

export function SpeakerAvatar({ speaker, className }: { speaker: PublicSpeaker; className?: string }) {
  // First letter of each name part — "Ada Lovelace" reads AL, not AD.
  const initials =
    [speaker.first_name, speaker.last_name]
      .filter(Boolean)
      .map((part) => part!.trim().charAt(0))
      .join("")
      .toUpperCase() ||
    (speaker.name || "?").charAt(0).toUpperCase();
  return (
    <Avatar className={cn("size-9", className)}>
      {speaker.headshot_file_id && <AvatarImage src={filesApi.publicHeadshotUrl(speaker.headshot_file_id)} alt="" />}
      <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
    </Avatar>
  );
}

/** "Job Title, Company" — collapses cleanly when either is missing (EMB-12). */
export function speakerSubtitle(speaker: PublicSpeaker): string {
  return [speaker.job_title, speaker.company].filter(Boolean).join(", ");
}

/** Long text that starts clamped with a Show more toggle (EMB-01, EMB-13). */
export function Expandable({ html, text, lines = 3 }: { html?: string | null; text?: string | null; lines?: number }) {
  const [open, setOpen] = useState(false);
  const body = html ?? text ?? "";
  if (!body.trim()) return null;
  const plain = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const needsToggle = plain.length > 180;
  return (
    <div>
      <div
        className={cn("text-sm leading-relaxed text-muted-foreground", !open && needsToggle && "line-clamp-3")}
        style={!open && needsToggle ? { WebkitLineClamp: lines } : undefined}
      >
        {html ? <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} /> : plain}
      </div>
      {needsToggle && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-xs font-medium text-primary hover:underline"
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  resultCount,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  resultCount?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8" />
      </div>
      {resultCount !== undefined && (
        <p className="text-sm text-muted-foreground" role="status">
          {resultCount} result{resultCount === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}

/**
 * Chrome shared by every widget: event header plus links to the sibling surfaces.
 *
 * Rendered without any auth check at all — these pages must be fully readable
 * logged out (EMB-14).
 */
export function WidgetShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const { data: program, isLoading, eventSlug } = usePublicProgram();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const theme = searchParams.get("theme");

  const tabs = useMemo(
    () => [
      { label: "Sessions", to: `/e/${eventSlug}/sessions` },
      { label: "Speakers", to: `/e/${eventSlug}/speakers` },
      { label: "Agenda", to: `/e/${eventSlug}/agenda` },
      { label: "Itinerary", to: `/e/${eventSlug}/itinerary` },
      { label: "Gallery", to: `/e/${eventSlug}/gallery` },
    ],
    [eventSlug],
  );

  if (isLoading) {
    return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  }
  if (!program) {
    return (
      <div className="p-8">
        <h1 className="text-lg font-semibold text-foreground">Event not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">Check the link and try again.</p>
      </div>
    );
  }

  const dates = eventDateRange(program);

  return (
    <div className={cn("min-h-screen bg-background text-foreground", theme === "light" && "light")}>
      <header className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <div className="flex items-start gap-3">
            <EventMark />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{program.event.name}</p>
              <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                {dates && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3" />
                    {dates}
                  </span>
                )}
                {program.event.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" />
                    {program.event.location}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3" />
                  {program.speakers.length} speakers
                </span>
              </p>
            </div>
          </div>
          <nav className="mt-5 flex flex-wrap gap-1">
            {tabs.map((tab) => (
              <Link
                key={tab.label}
                to={tab.to}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  pathname === tab.to
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}

/** Shown when the organizer has not published the agenda yet. */
export function NotPublished({ what }: { what: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <p className="text-sm font-medium text-foreground">The {what} isn&apos;t published yet</p>
      <p className="mt-1 text-sm text-muted-foreground">Check back once the organizers publish the programme.</p>
    </div>
  );
}
