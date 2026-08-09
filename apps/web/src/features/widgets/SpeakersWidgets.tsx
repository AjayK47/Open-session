import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Globe, Linkedin, MapPin, X } from "lucide-react";
import { Button, cn } from "@opensession/ui";
import type { PublicSpeakerWithSessions } from "@opensession/schemas";
import {
  Expandable,
  SearchBox,
  SpeakerAvatar,
  TrackTag,
  WidgetShell,
  speakerSubtitle,
  usePublicProgram,
} from "./widget-kit";

function useSpeakerSearch() {
  const { data: program } = usePublicProgram();
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!program) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return program.speakers;
    return program.speakers.filter((s) =>
      [s.name, s.company ?? "", s.job_title ?? ""].join(" ").toLowerCase().includes(needle),
    );
  }, [program, search]);
  return { program, search, setSearch, filtered };
}

/** Sessions a speaker is on — shared by the list drill-in and the gallery modal. */
function SpeakerSessions({ speaker, timezone }: { speaker: PublicSpeakerWithSessions; timezone: string }) {
  if (speaker.sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">No sessions listed yet.</p>;
  }
  return (
    <ul className="space-y-3">
      {speaker.sessions.map((session) => (
        <li key={session.id} className="rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <TrackTag track={session.track} />
          </div>
          <p className="mt-1 text-sm font-medium text-foreground">{session.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" />
              {session.starts_at
                ? new Intl.DateTimeFormat("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: timezone,
                  }).format(new Date(session.starts_at))
                : "Time to be announced"}
            </span>
            {session.room && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {session.room.name}
              </span>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}

function SpeakerLinks({ speaker }: { speaker: PublicSpeakerWithSessions }) {
  const links = [
    speaker.website && { href: speaker.website, icon: Globe, label: "Website" },
    speaker.linkedin_url && { href: speaker.linkedin_url, icon: Linkedin, label: "LinkedIn" },
  ].filter(Boolean) as { href: string; icon: typeof Globe; label: string }[];
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <link.icon className="size-3.5" />
          {link.label}
        </a>
      ))}
    </div>
  );
}

/** Speakers directory with drill-in detail (EMB-04/05). */
export function SpeakersListWidget() {
  const { program, search, setSearch, filtered } = useSpeakerSearch();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!program) return <WidgetShell title="Speakers">{null}</WidgetShell>;
  const timezone = program.event.timezone || "UTC";
  const selected = filtered.find((s) => s.id === selectedId) ?? null;

  if (selected) {
    return (
      <WidgetShell title="Speakers">
        <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)} className="mb-4">
          <ArrowLeft />
          Back to all speakers
        </Button>
        <div className="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="rounded-xl border border-border bg-card p-5 text-center">
            <SpeakerAvatar speaker={selected} className="mx-auto size-24" />
            <p className="mt-3 font-medium text-foreground">{selected.name}</p>
            {speakerSubtitle(selected) && (
              <p className="text-sm text-muted-foreground">{speakerSubtitle(selected)}</p>
            )}
            <div className="mt-3 flex justify-center">
              <SpeakerLinks speaker={selected} />
            </div>
          </div>
          <div className="space-y-6">
            {selected.bio && (
              <section>
                <h2 className="mb-2 text-sm font-medium text-foreground">Biography</h2>
                <Expandable html={selected.bio} lines={6} />
              </section>
            )}
            <section>
              <h2 className="mb-2 text-sm font-medium text-foreground">Sessions</h2>
              <SpeakerSessions speaker={selected} timezone={timezone} />
            </section>
          </div>
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell title="Speakers" subtitle={`${program.speakers.length} speakers, listed by surname`}>
      <div className="space-y-4">
        <SearchBox value={search} onChange={setSearch} placeholder="Search by name…" resultCount={filtered.length} />
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {filtered.map((speaker) => (
            <li key={speaker.id}>
              <button
                type="button"
                onClick={() => setSelectedId(speaker.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
              >
                <SpeakerAvatar speaker={speaker} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{speaker.name}</p>
                  {speakerSubtitle(speaker) && (
                    <p className="truncate text-xs text-muted-foreground">{speakerSubtitle(speaker)}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {speaker.sessions.length} session{speaker.sessions.length === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </WidgetShell>
  );
}

/** Photo grid with a detail modal (EMB-12/13). */
export function SpeakerGalleryWidget() {
  const { program, search, setSearch, filtered } = useSpeakerSearch();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Escape closes the detail pop-up, which is the one keyboard affordance people
  // reach for without being told.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  if (!program) return <WidgetShell title="Speaker gallery">{null}</WidgetShell>;
  const timezone = program.event.timezone || "UTC";
  const selected = program.speakers.find((s) => s.id === selectedId) ?? null;

  return (
    <WidgetShell title="Speaker gallery" subtitle={`${program.speakers.length} speakers`}>
      <div className="space-y-4">
        <SearchBox value={search} onChange={setSearch} placeholder="Search by name…" resultCount={filtered.length} />
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((speaker) => (
            <li key={speaker.id}>
              <button
                type="button"
                onClick={() => setSelectedId(speaker.id)}
                className="flex w-full flex-col items-center rounded-xl border border-border bg-card p-4 text-center transition-colors hover:border-primary/40"
              >
                <SpeakerAvatar speaker={speaker} className="size-20" />
                <p className="mt-3 line-clamp-2 text-sm font-medium text-foreground">{speaker.name}</p>
                {/* Degrades gracefully: a speaker with no title or company simply
                    shows their name, rather than an empty line. */}
                {speakerSubtitle(speaker) && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{speakerSubtitle(speaker)}</p>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${selected.name} details`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelectedId(null)}
        >
          <div
            className={cn("max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-6")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <SpeakerAvatar speaker={selected} className="size-16" />
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{selected.name}</p>
                  {speakerSubtitle(selected) && (
                    <p className="text-sm text-muted-foreground">{speakerSubtitle(selected)}</p>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setSelectedId(null)}>
                <X />
              </Button>
            </div>
            <div className="mt-4">
              <SpeakerLinks speaker={selected} />
            </div>
            {selected.bio && (
              <div className="mt-4">
                <Expandable html={selected.bio} lines={5} />
              </div>
            )}
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-medium text-foreground">Sessions</h3>
              <SpeakerSessions speaker={selected} timezone={timezone} />
            </div>
          </div>
        </div>
      )}
    </WidgetShell>
  );
}
