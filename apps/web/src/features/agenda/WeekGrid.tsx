import { useMemo, useState } from "react";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { format } from "date-fns";
import { CalendarPlus, GripVertical, Inbox } from "lucide-react";
import {
  Button,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@opensession/ui";
import type { Event, ProgramSession, Room } from "@opensession/schemas";
import { EmptyState } from "../../components/empty-state";
import { TrackPill } from "../../components/track-tag-picker";
import { SLOT_MINUTES, cellForSession, eventDays, sameDay, slotInstant, slotsForDay, wallClock } from "./time";

/**
 * Week view: days across, time down — the whole event at once.
 *
 * The Day view's grid is room × time for a single day; this one is day × time
 * across every day. Because a week cell has no room axis, dropping here keeps
 * the session's existing room, and the click-to-schedule popover asks for one.
 *
 * A cell can hold several sessions (different rooms, same slot), so cells render
 * a stack rather than a single card.
 */
export function WeekGrid({
  event,
  sessions,
  rooms,
  unscheduled,
  tracks,
  onSchedule,
}: {
  event?: Event;
  sessions: ProgramSession[];
  rooms: Room[];
  unscheduled: ProgramSession[];
  tracks: { id: string; name: string }[];
  onSchedule: (sessionId: string, roomId: string | null, startsAt: string, endsAt: string) => void;
}) {
  const timezone = event?.timezone || "UTC";
  const days = useMemo(() => eventDays(event), [event]);
  const slots = useMemo(() => slotsForDay(), []);

  // dayIndex:hour:minute -> sessions in that cell
  const sessionsByCell = useMemo(() => {
    const map = new Map<string, ProgramSession[]>();
    for (const session of sessions) {
      if (!session.starts_at) continue;
      const { day, hour, minute } = cellForSession(session.starts_at, timezone);
      const dayIndex = days.findIndex((d) => sameDay(d, day));
      if (dayIndex < 0) continue;
      const key = `${dayIndex}:${hour}:${minute}`;
      const bucket = map.get(key);
      if (bucket) bucket.push(session);
      else map.set(key, [session]);
    }
    return map;
  }, [sessions, days, timezone]);

  function handleDragEnd(dragEvent: DragEndEvent) {
    const { active, over } = dragEvent;
    if (!over) return;
    const sessionId = String(active.id).replace(/^(pool|scheduled):/, "");
    const [, dayIdxStr, hourStr, minuteStr] = String(over.id).split(":");
    const day = days[Number(dayIdxStr)];
    if (!day) return;
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const duration = session.duration_minutes ?? 30;
    const start = slotInstant(day, Number(hourStr), Number(minuteStr), timezone);
    const end = new Date(start.getTime() + duration * 60_000);
    // No room axis in this view — keep whatever room the session already had.
    onSchedule(sessionId, session.room_id ?? null, start.toISOString(), end.toISOString());
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex h-full min-h-0">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unscheduled</p>
            <span className="text-xs tabular text-muted-foreground">{unscheduled.length}</span>
          </div>
          <div className="space-y-2">
            {unscheduled.map((session) => (
              <WeekPoolCard
                key={session.id}
                session={session}
                rooms={rooms}
                days={days}
                timezone={timezone}
                onSchedule={onSchedule}
              />
            ))}
            {unscheduled.length === 0 && <p className="text-sm text-muted-foreground">Everything is scheduled.</p>}
          </div>
        </aside>

        <div className="min-w-0 flex-1 overflow-auto">
          <div
            className="grid min-w-[52rem]"
            style={{ gridTemplateColumns: `72px repeat(${days.length}, minmax(150px, 1fr))` }}
          >
            <div className="sticky top-0 z-10 border-b border-r border-border bg-card" />
            {days.map((day, i) => (
              <div
                key={i}
                className="sticky top-0 z-10 border-b border-r border-border bg-card px-3 py-2 text-sm font-medium text-foreground"
              >
                {format(day, "EEE")}{" "}
                <span className="tabular text-muted-foreground">{format(day, "MMM d")}</span>
              </div>
            ))}

            {slots.map((slot, slotIdx) => (
              <RowFragment key={slotIdx}>
                <div className="border-b border-r border-border px-2 py-2 text-right text-xs tabular text-muted-foreground">
                  {slot.minute === 0 ? format(wallClock(days[0]!, slot.hour, slot.minute), "h a") : ""}
                </div>
                {days.map((_, dayIdx) => {
                  const key = `${dayIdx}:${slot.hour}:${slot.minute}`;
                  return (
                    <WeekCell key={dayIdx} id={`cell:${key}`}>
                      {(sessionsByCell.get(key) ?? []).map((session) => (
                        <WeekSessionCard key={session.id} session={session} tracks={tracks} />
                      ))}
                    </WeekCell>
                  );
                })}
              </RowFragment>
            ))}
          </div>
        </div>
      </div>
    </DndContext>
  );
}

function RowFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function WeekCell({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn("min-h-11 space-y-0.5 border-b border-r border-border p-0.5", isOver && "bg-accent")}
    >
      {children}
    </div>
  );
}

function WeekSessionCard({ session, tracks }: { session: ProgramSession; tracks: { id: string; name: string }[] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `scheduled:${session.id}` });
  const track = tracks.find((t) => t.id === session.track_id);
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        "cursor-grab rounded-md border border-border bg-secondary px-1.5 py-1 text-[11px] leading-4 shadow-xs",
        isDragging && "opacity-50",
      )}
    >
      <p className="truncate font-medium text-foreground">{session.title}</p>
      <div className="flex items-center gap-1">
        {session.room_name ? <span className="truncate text-muted-foreground">{session.room_name}</span> : null}
        {track ? <TrackPill id={track.id} name={track.name} className="px-1 py-0 text-[10px]" /> : null}
      </div>
    </div>
  );
}

/**
 * dnd-kit's PointerSensor does not respond to synthetic pointer events, so
 * dragging is unreachable in automated browser testing and for keyboard users.
 * This popover is the accessible path and the one that can be verified.
 */
function WeekPoolCard({
  session,
  rooms,
  days,
  timezone,
  onSchedule,
}: {
  session: ProgramSession;
  rooms: Room[];
  days: Date[];
  timezone: string;
  onSchedule: (sessionId: string, roomId: string | null, startsAt: string, endsAt: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `pool:${session.id}` });
  const [open, setOpen] = useState(false);
  const [dayIdx, setDayIdx] = useState("0");
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [hour, setHour] = useState("9");

  function commit() {
    const day = days[Number(dayIdx)];
    if (!day) return;
    const duration = session.duration_minutes ?? 30;
    const start = slotInstant(day, Number(hour), 0, timezone);
    const end = new Date(start.getTime() + duration * 60_000);
    onSchedule(session.id, roomId || null, start.toISOString(), end.toISOString());
    setOpen(false);
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-2.5 shadow-xs",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-start gap-2">
        <span ref={setNodeRef} {...listeners} {...attributes} className="mt-0.5 cursor-grab text-muted-foreground">
          <GripVertical className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{session.title}</p>
          <p className="text-xs tabular text-muted-foreground">{session.duration_minutes ?? 30} min</p>
        </div>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="mt-2 w-full">
            <CalendarPlus />
            Schedule
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 space-y-2.5">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Day</p>
            <Select value={dayIdx} onValueChange={setDayIdx}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {days.map((d, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {format(d, "EEE MMM d")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Room</p>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a room" />
              </SelectTrigger>
              <SelectContent>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Start hour</p>
            <Select value={hour} onValueChange={setHour}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {slotsForDay()
                  .filter((s) => s.minute === 0)
                  .map((s) => (
                    <SelectItem key={s.hour} value={String(s.hour)}>
                      {format(wallClock(days[0]!, s.hour, 0), "h a")}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="w-full" onClick={commit}>
            Schedule
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function WeekEmpty() {
  return (
    <div className="p-6">
      <EmptyState
        icon={Inbox}
        title="Add a room first"
        description="Create at least one room in Program Setup to schedule sessions."
      />
    </div>
  );
}

export const WEEK_SLOT_MINUTES = SLOT_MINUTES;
