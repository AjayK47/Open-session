import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, AlertTriangle, Globe, Send, Wand2 } from "lucide-react";
import { Button, cn } from "@opensession/ui";
import { toast } from "sonner";
import { sessionsApi, programApi, ApiError } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { PageHeader } from "../../layouts/organizer-shell";
import { StatusPill } from "../../components/status-pill";
import { TrackPill } from "../../components/track-tag-picker";
import { EmptyState } from "../../components/empty-state";
import { DayScheduler } from "./DayScheduler";
import { WeekGrid, WeekEmpty } from "./WeekGrid";

/** The brief names five views: "list, day, week, track, or room" — plus a
 *  conflicts view of our own for the conflict engine. */
type View = "list" | "day" | "week" | "track" | "room" | "conflicts";
const VIEWS: { key: View; label: string }[] = [
  { key: "list", label: "List" },
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "track", label: "Track" },
  { key: "room", label: "Room" },
  { key: "conflicts", label: "Conflicts" },
];

export function AgendaPage() {
  const { event, eventId } = useCurrentEvent();
  const [view, setView] = useState<View>("day");
  const queryClient = useQueryClient();

  const { data: sessions = [] } = useQuery({ queryKey: ["sessions", eventId], queryFn: () => sessionsApi.list(eventId) });
  const { data: rooms = [] } = useQuery({ queryKey: ["rooms", eventId], queryFn: () => programApi.rooms.list(eventId) });
  const { data: tracks = [] } = useQuery({ queryKey: ["tracks", eventId], queryFn: () => programApi.tracks.list(eventId) });
  const { data: conflicts = [] } = useQuery({ queryKey: ["conflicts", eventId], queryFn: () => sessionsApi.conflicts(eventId) });

  const unscheduled = sessions.filter((s) => !s.starts_at);
  const scheduled = sessions.filter((s) => s.starts_at);

  const schedule = useMutation({
    mutationFn: (input: { sessionId: string; roomId: string | null; startsAt: string; endsAt: string; allowSoft?: boolean }) =>
      sessionsApi.schedule(input.sessionId, { room_id: input.roomId, starts_at: input.startsAt, ends_at: input.endsAt, allow_soft: input.allowSoft }),
    onSuccess: () => {
      toast.success("Session scheduled");
      void queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["conflicts", eventId] });
    },
    onError: (error, variables) => {
      const message = error instanceof ApiError ? error.message2 : "Could not schedule session";
      if (error instanceof ApiError && error.status === 409 && !variables.allowSoft) {
        toast.error(message, {
          action: {
            label: "Override & save anyway",
            onClick: () => schedule.mutate({ ...variables, allowSoft: true }),
          },
        });
      } else {
        toast.error(message);
      }
    },
  });

  const autoSchedule = useMutation({
    mutationFn: () => sessionsApi.autoSchedule(eventId),
    onSuccess: (result) => {
      toast.success(
        result.skipped
          ? `Placed ${result.placed}; ${result.skipped} couldn't be fitted`
          : `Placed ${result.placed} session${result.placed === 1 ? "" : "s"}`,
      );
      void queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["conflicts", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not auto-schedule"),
  });

  const publish = useMutation({
    mutationFn: () => sessionsApi.publishAgenda(eventId),
    onSuccess: (result) => {
      // Publishing only promotes sessions that actually have a slot, so a zero
      // here is the useful answer — silently "succeeding" would hide it.
      if (result.published_sessions === 0) {
        toast.warning("Nothing to publish yet — schedule at least one session first.");
      } else {
        toast.success(`${result.published_sessions} session(s) are now public`, {
          action: { label: "View", onClick: () => window.open(result.public_url, "_blank", "noopener") },
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not publish the agenda"),
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={CalendarDays}
        title="Agenda"
        subtitle="Drag-and-drop schedule with automatic conflict detection."
        actions={
          <div className="flex items-center gap-2">
            {event?.agenda_published_at && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Globe className="size-3.5" />
                Published
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => autoSchedule.mutate()}
              disabled={autoSchedule.isPending || unscheduled.length === 0}
            >
              <Wand2 />
              Auto-schedule ({unscheduled.length})
            </Button>
            <Button size="sm" onClick={() => publish.mutate()} disabled={publish.isPending}>
              <Send />
              {event?.agenda_published_at ? "Republish agenda" : "Publish agenda"}
            </Button>
          </div>
        }
      />
      <div className="flex items-center gap-1 border-b border-border px-6 py-2">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              view === v.key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary",
            )}
          >
            {v.label}
            {v.key === "conflicts" && conflicts.length > 0 && (
              <span className="ml-1.5 rounded-full bg-destructive/15 px-1.5 py-0.5 text-xs text-destructive">{conflicts.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {view === "day" && (
          <DayScheduler
            event={event}
            sessions={sessions}
            rooms={rooms}
            unscheduled={unscheduled}
            onSchedule={(sessionId, roomId, startsAt, endsAt) => schedule.mutate({ sessionId, roomId, startsAt, endsAt })}
          />
        )}

        {view === "week" &&
          (rooms.length === 0 ? (
            <WeekEmpty />
          ) : (
            <WeekGrid
              event={event}
              sessions={sessions}
              rooms={rooms}
              unscheduled={unscheduled}
              tracks={tracks}
              onSchedule={(sessionId, roomId, startsAt, endsAt) =>
                schedule.mutate({ sessionId, roomId, startsAt, endsAt })
              }
            />
          ))}

        {view === "list" && (
          <div className="p-6">
            <SessionRows sessions={scheduled} tracks={tracks} emptyLabel="No sessions scheduled yet" />
          </div>
        )}

        {view === "track" && (
          <div className="space-y-6 p-6">
            {tracks.map((track) => (
              <div key={track.id}>
                <div className="mb-2">
                  <TrackPill id={track.id} name={track.name} />
                </div>
                <SessionRows sessions={scheduled.filter((s) => s.track_id === track.id)} tracks={tracks} emptyLabel="No sessions in this track" compact />
              </div>
            ))}
          </div>
        )}

        {view === "room" && (
          <div className="space-y-6 p-6">
            {rooms.map((room) => (
              <div key={room.id}>
                <p className="mb-2 text-sm font-semibold text-foreground">{room.name}</p>
                <SessionRows sessions={scheduled.filter((s) => s.room_id === room.id)} tracks={tracks} emptyLabel="No sessions in this room" compact />
              </div>
            ))}
          </div>
        )}

        {view === "conflicts" && (
          <div className="space-y-2 p-6">
            {conflicts.length === 0 ? (
              <EmptyState icon={AlertTriangle} title="No conflicts" description="The schedule is clean." />
            ) : (
              conflicts.map((c, i) => (
                <div key={i} className={cn("rounded-lg border p-3 text-sm", c.severity === "hard" ? "border-destructive/40 bg-destructive/5" : "border-warning/40 bg-warning/5")}>
                  <div className="flex items-center gap-2">
                    <StatusPill label={c.kind} tone={c.severity === "hard" ? "negative" : "attention"} />
                    <span className="text-xs uppercase text-muted-foreground">{c.severity}</span>
                  </div>
                  <p className="mt-1 text-foreground">{c.detail}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionRows({
  sessions,
  tracks,
  emptyLabel,
  compact,
}: {
  sessions: { id: string; title: string; status: string; room_name: string | null; starts_at: string | null; ends_at: string | null; track_id: string | null }[];
  tracks: { id: string; name: string }[];
  emptyLabel: string;
  compact?: boolean;
}) {
  const sorted = useMemo(() => [...sessions].sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? "")), [sessions]);
  if (sorted.length === 0) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <div className={cn("divide-y divide-border rounded-lg border border-border", compact && "text-sm")}>
      {sorted.map((s) => {
        const track = tracks.find((t) => t.id === s.track_id);
        return (
          <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
            <div>
              <p className="font-medium text-foreground">{s.title}</p>
              <p className="text-xs text-muted-foreground">
                {s.starts_at ? new Date(s.starts_at).toLocaleString() : "Unscheduled"} {s.room_name ? `· ${s.room_name}` : ""}
              </p>
            </div>
            {track && <TrackPill id={track.id} name={track.name} />}
          </div>
        );
      })}
    </div>
  );
}
