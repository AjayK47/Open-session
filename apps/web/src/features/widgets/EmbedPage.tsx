import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn } from "@opensession/ui";
import { eventsApi, publicApi } from "../../api";
import { PageHeader } from "../../layouts/organizer-shell";

/**
 * Organizer-facing embed & share area (EMB-15).
 *
 * Each public widget gets a direct link plus a copy-paste iframe snippet, so an
 * organizer can drop the programme onto their own marketing site without anyone
 * writing markup.
 */
const WIDGETS = [
  {
    key: "sessions",
    name: "Sessions list",
    description: "Every published session with search, and track, format and room filters.",
    height: 900,
  },
  {
    key: "speakers",
    name: "Speakers list",
    description: "Speaker directory by surname, each with their bio and sessions.",
    height: 800,
  },
  { key: "agenda", name: "Agenda", description: "Day-by-day grid and list views of the schedule.", height: 900 },
  {
    key: "itinerary",
    name: "Personal itinerary",
    description: "Attendees pick sessions, see clashes, and export an .ics file.",
    height: 900,
  },
  {
    key: "gallery",
    name: "Speaker gallery",
    description: "Headshot grid with a detail pop-up for each speaker.",
    height: 800,
  },
] as const;

export function EmbedPage() {
  const [theme, setTheme] = useState("dark");
  const [trackId, setTrackId] = useState("all");
  const { eventId } = useParams<{ eventId: string }>();
  const { data: event } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => eventsApi.get(eventId!),
    enabled: Boolean(eventId),
  });

  const slug = event?.slug ?? "";
  const { data: program } = useQuery({
    queryKey: ["public-program", slug],
    queryFn: () => publicApi.getProgram(slug),
    enabled: Boolean(slug),
  });

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const published = Boolean(event?.agenda_published_at);

  return (
    <div>
      <PageHeader
        icon={Share2}
        title="Embed & share"
        subtitle="Public links and iframe snippets for each attendee-facing widget."
      />
      <div className="space-y-5 px-6 py-6">
        {!published && (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
            The agenda isn&apos;t published yet, so the agenda widget shows a placeholder. Sessions, speakers and the
            gallery are already live. Publish from <strong>Agenda → Publish agenda</strong> when you&apos;re ready.
          </p>
        )}

        {program && (
          <p className="text-sm text-muted-foreground">
            {program.sessions.length} session{program.sessions.length === 1 ? "" : "s"} and{" "}
            {program.speakers.length} speaker{program.speakers.length === 1 ? "" : "s"} are publicly visible. Only
            approved sessions appear — anything still in draft or pending review stays hidden.
          </p>
        )}

        <section className="rounded-xl border border-border bg-card p-4">
          <div><h2 className="text-sm font-medium text-foreground">Embed configuration</h2><p className="mt-0.5 text-sm text-muted-foreground">These choices are encoded into every public link and iframe below.</p></div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Theme</Label><Select value={theme} onValueChange={setTheme}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="dark">Dark</SelectItem><SelectItem value="light">Light</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Track filter</Label><Select value={trackId} onValueChange={setTrackId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All tracks</SelectItem>{program?.tracks.map((track) => <SelectItem key={track.id} value={track.id}>{track.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          {WIDGETS.map((widget) => (
            <WidgetCard key={widget.key} widget={widget} origin={origin} slug={slug} theme={theme} trackId={trackId} />
          ))}
        </div>
      </div>
    </div>
  );
}

function WidgetCard({
  widget,
  origin,
  slug,
  theme,
  trackId,
}: {
  widget: (typeof WIDGETS)[number];
  origin: string;
  slug: string;
  theme: string;
  trackId: string;
}) {
  const query = new URLSearchParams({ theme });
  if (trackId !== "all") query.set("track", trackId);
  const url = `${origin}/e/${slug}/${widget.key}?${query.toString()}`;
  const snippet = useMemo(
    () =>
      `<iframe src="${url}" title="${widget.name}" width="100%" height="${widget.height}" style="border:0" loading="lazy"></iframe>`,
    [url, widget.name, widget.height],
  );

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">{widget.name}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{widget.description}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={url} target="_blank" rel="noreferrer noopener">
            <ExternalLink />
            Open
          </a>
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        <CopyField label="Public link" value={url} />
        <CopyField label="Embed code" value={snippet} multiline />
      </div>
    </section>
  );
}

function CopyField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      // Reverts the button so a second copy still reads as an action.
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy — select the text and copy manually.");
    }
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button variant="ghost" size="sm" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <code
        className={cn(
          "block rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs text-foreground",
          multiline ? "whitespace-pre-wrap break-all" : "truncate",
        )}
      >
        {value}
      </code>
    </div>
  );
}
