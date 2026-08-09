import { useMemo, useState } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import { Button, cn } from "@opensession/ui";
import {
  Expandable,
  FormatTag,
  SearchBox,
  SpeakerAvatar,
  TrackTag,
  WidgetShell,
  sessionTime,
  speakerSubtitle,
  usePublicProgram,
} from "./widget-kit";

/**
 * Public sessions list (EMB-01/02/03).
 *
 * Search deliberately spans session titles *and* speaker names — attendees look
 * for "the talk by Priya" at least as often as they look for a title.
 */
export function SessionsListWidget() {
  const { data: program } = usePublicProgram();
  const [search, setSearch] = useState("");
  const [trackIds, setTrackIds] = useState<string[]>([]);
  const [formatIds, setFormatIds] = useState<string[]>([]);
  const [roomIds, setRoomIds] = useState<string[]>([]);

  const timezone = program?.event.timezone || "UTC";

  const filtered = useMemo(() => {
    if (!program) return [];
    const needle = search.trim().toLowerCase();
    return program.sessions.filter((session) => {
      if (trackIds.length && !(session.track && trackIds.includes(session.track.id))) return false;
      if (formatIds.length && !(session.format && formatIds.includes(session.format.id))) return false;
      if (roomIds.length && !(session.room && roomIds.includes(session.room.id))) return false;
      if (!needle) return true;
      const haystack = [
        session.title,
        ...session.speakers.map((s) => s.name),
        ...session.speakers.map((s) => s.company ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [program, search, trackIds, formatIds, roomIds]);

  if (!program) return <WidgetShell title="Sessions">{null}</WidgetShell>;

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const anyFilter = trackIds.length + formatIds.length + roomIds.length > 0;

  return (
    <WidgetShell title="Sessions" subtitle={`${program.sessions.length} sessions in the programme`}>
      <div className="space-y-4">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search sessions or speakers…"
          resultCount={filtered.length}
        />

        <div className="space-y-2 rounded-lg border border-border p-3">
          <FilterRow label="Track" options={program.tracks} selected={trackIds} onToggle={(id) => toggle(trackIds, setTrackIds, id)} />
          <FilterRow label="Format" options={program.formats} selected={formatIds} onToggle={(id) => toggle(formatIds, setFormatIds, id)} />
          <FilterRow label="Room" options={program.rooms} selected={roomIds} onToggle={(id) => toggle(roomIds, setRoomIds, id)} />
          {anyFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTrackIds([]);
                setFormatIds([]);
                setRoomIds([]);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No sessions match those filters.
          </p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {filtered.map((session) => (
              <li key={session.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <TrackTag track={session.track} />
                  <FormatTag format={session.format} />
                </div>
                <h2 className="mt-2 text-base font-semibold text-foreground">{session.title}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
                <div className="mt-3">
                  <Expandable html={session.description} />
                </div>
                {session.speakers.length > 0 && (
                  <ul className="mt-4 space-y-2 border-t border-border pt-3">
                    {session.speakers.map((speaker) => (
                      <li key={speaker.id} className="flex items-center gap-2.5">
                        <SpeakerAvatar speaker={speaker} className="size-8" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{speaker.name}</p>
                          {speakerSubtitle(speaker) && (
                            <p className="truncate text-xs text-muted-foreground">{speakerSubtitle(speaker)}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </WidgetShell>
  );
}

function FilterRow({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={selected.includes(option.id)}
          onClick={() => onToggle(option.id)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs transition-colors",
            selected.includes(option.id)
              ? "border-primary bg-accent text-accent-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {option.name}
        </button>
      ))}
    </div>
  );
}
