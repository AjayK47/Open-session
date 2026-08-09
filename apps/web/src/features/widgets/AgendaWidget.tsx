import { useMemo, useState } from "react";
import { MapPin, X } from "lucide-react";
import { Button, cn } from "@opensession/ui";
import type { PublicProgram, PublicSession } from "@opensession/schemas";
import {
  Expandable,
  FormatTag,
  NotPublished,
  SpeakerAvatar,
  TrackTag,
  WidgetShell,
  dayKey,
  dayLabel,
  eventDays,
  speakerSubtitle,
  usePublicProgram,
} from "./widget-kit";

function timeOnly(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

/**
 * Day-by-day agenda (EMB-06/07/08).
 *
 * Grid view is the room-by-time layout attendees expect from a conference
 * programme; list view is the same data stacked, which is the only thing that
 * survives a phone screen.
 */
export function AgendaWidget() {
  const { data: program } = usePublicProgram();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [selected, setSelected] = useState<PublicSession | null>(null);

  const days = useMemo(() => (program ? eventDays(program) : []), [program]);

  if (!program) return <WidgetShell title="Agenda">{null}</WidgetShell>;

  const timezone = program.event.timezone || "UTC";
  if (!program.event.agenda_published_at) {
    return (
      <WidgetShell title="Agenda">
        <NotPublished what="agenda" />
      </WidgetShell>
    );
  }

  const day = activeDay ?? days[0] ?? null;
  const scheduled = program.sessions.filter((s) => s.starts_at);
  const forDay = day ? scheduled.filter((s) => dayKey(s.starts_at!, timezone) === day) : [];
  const unscheduled = program.sessions.filter((s) => !s.starts_at);

  return (
    <WidgetShell
      title="Agenda"
      subtitle={
        <>
          All times shown in <strong>{timezone}</strong>, the event&apos;s local time zone.
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Event days">
            {days.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={value === day}
                onClick={() => setActiveDay(value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  value === day
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {dayLabel(`${value}T12:00:00Z`, "UTC")}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-md border border-border p-0.5">
            {(["grid", "list"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
                className={cn(
                  "rounded px-3 py-1 text-xs capitalize transition-colors",
                  view === mode ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {forDay.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nothing scheduled for this day yet.
          </p>
        ) : view === "grid" ? (
          <AgendaGrid sessions={forDay} program={program} timezone={timezone} onSelect={setSelected} />
        ) : (
          <AgendaList sessions={forDay} timezone={timezone} onSelect={setSelected} />
        )}

        {unscheduled.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-medium text-foreground">Times to be announced</h2>
            <AgendaList sessions={unscheduled} timezone={timezone} onSelect={setSelected} />
          </section>
        )}
      </div>
      {selected && <SessionDetail session={selected} timezone={timezone} onClose={() => setSelected(null)} />}
    </WidgetShell>
  );
}

/** Rooms across the top, time slots down the side. */
function AgendaGrid({
  sessions,
  program,
  timezone,
  onSelect,
}: {
  sessions: PublicSession[];
  program: PublicProgram;
  timezone: string;
  onSelect: (session: PublicSession) => void;
}) {
  // Only rooms actually in use today get a column — an empty column for every
  // room the event owns makes the grid unreadable on a two-room day.
  const roomIds = new Set(sessions.map((s) => s.room?.id).filter(Boolean) as string[]);
  const rooms = program.rooms.filter((r) => roomIds.has(r.id));
  const hasUnassigned = sessions.some((s) => !s.room);
  const columns = [...rooms, ...(hasUnassigned ? [{ id: "__none", name: "Unassigned" }] : [])];

  const slots = [...new Set(sessions.map((s) => s.starts_at!))].sort();

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[40rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th scope="col" className="w-28 px-3 py-2 text-xs font-medium text-muted-foreground">
              Time
            </th>
            {columns.map((room) => (
              <th key={room.id} scope="col" className="px-3 py-2 text-xs font-medium text-foreground">
                {room.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr key={slot} className="border-b border-border last:border-0 align-top">
              <th scope="row" className="px-3 py-3 text-xs font-medium text-muted-foreground">
                {timeOnly(slot, timezone)}
              </th>
              {columns.map((room) => {
                const cell = sessions.filter(
                  (s) => s.starts_at === slot && (s.room?.id ?? "__none") === room.id,
                );
                return (
                  <td key={room.id} className="px-3 py-3">
                    {cell.map((session) => (
                      <button type="button" key={session.id} onClick={() => onSelect(session)} className="mb-2 block w-full rounded-md p-1 text-left transition-colors hover:bg-accent last:mb-0">
                        <TrackTag track={session.track} />
                        <p className="mt-1 text-sm font-medium text-foreground">{session.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {session.speakers.map((s) => s.name).join(", ")}
                        </p>
                      </button>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgendaList({ sessions, timezone, onSelect }: { sessions: PublicSession[]; timezone: string; onSelect: (session: PublicSession) => void }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {sessions.map((session) => (
        <li key={session.id}>
          <button type="button" onClick={() => onSelect(session)} className="grid w-full gap-3 p-4 text-left transition-colors hover:bg-accent/40 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <div className="text-xs font-medium text-muted-foreground">
            {session.starts_at ? (
              <>
                {timeOnly(session.starts_at, timezone)}
                {session.ends_at && <> – {timeOnly(session.ends_at, timezone)}</>}
              </>
            ) : (
              "TBA"
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <TrackTag track={session.track} />
              <FormatTag format={session.format} />
            </div>
            <p className="mt-1 text-sm font-medium text-foreground">{session.title}</p>
            {(session.room || session.location) && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" />
                {session.room?.name ?? session.location}
              </p>
            )}
            <div className="mt-2">
              <Expandable html={session.description} lines={2} />
            </div>
            {session.speakers.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-4">
                {session.speakers.map((speaker) => (
                  <li key={speaker.id} className="flex items-center gap-2">
                    <SpeakerAvatar speaker={speaker} className="size-7" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{speaker.name}</p>
                      {speakerSubtitle(speaker) && (
                        <p className="truncate text-[11px] text-muted-foreground">{speakerSubtitle(speaker)}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SessionDetail({ session, timezone, onClose }: { session: PublicSession; timezone: string; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={`${session.title} details`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <article className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap gap-2"><TrackTag track={session.track} /><FormatTag format={session.format} /></div><h2 className="mt-2 text-xl font-semibold text-foreground">{session.title}</h2></div><Button variant="ghost" size="icon-sm" aria-label="Close session details" onClick={onClose}><X /></Button></div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span>{session.starts_at ? `${dayLabel(session.starts_at, timezone)} · ${timeOnly(session.starts_at, timezone)}${session.ends_at ? ` – ${timeOnly(session.ends_at, timezone)}` : ""}` : "Time to be announced"}</span>{(session.room || session.location) && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{session.room?.name ?? session.location}</span>}</div>
        <div className="mt-5"><Expandable html={session.description} lines={20} /></div>
        {session.speakers.length > 0 && <section className="mt-6 border-t border-border pt-4"><h3 className="mb-3 text-sm font-medium text-foreground">Speakers</h3><ul className="grid gap-3 sm:grid-cols-2">{session.speakers.map((speaker) => <li key={speaker.id} className="flex items-center gap-3"><SpeakerAvatar speaker={speaker} /><div><p className="text-sm font-medium text-foreground">{speaker.name}</p>{speakerSubtitle(speaker) && <p className="text-xs text-muted-foreground">{speakerSubtitle(speaker)}</p>}</div></li>)}</ul></section>}
      </article>
    </div>
  );
}
