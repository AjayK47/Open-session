import { useMemo, useState } from "react";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { GripVertical, CalendarPlus } from "lucide-react";
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
import { SLOT_MINUTES, eventDays, slotsForDay, wallClock, slotInstant } from "./time";
import { Inbox } from "lucide-react";

export function DayScheduler({
  event,
  sessions,
  rooms,
  unscheduled,
  onSchedule,
}: {
  event?: Event;
  sessions: ProgramSession[];
  rooms: Room[];
  unscheduled: ProgramSession[];
  onSchedule: (sessionId: string, roomId: string | null, startsAt: string, endsAt: string) => void;
}) {
  const timezone = event?.timezone || "UTC";
  const days = useMemo(() => eventDays(event), [event]);
  const [dayIndex, setDayIndex] = useState(0);
  const day = days[dayIndex] ?? days[0]!;
  const slots = useMemo(() => slotsForDay(), []);

  const sessionsByCell = useMemo(() => {
    const map = new Map<string, ProgramSession>();
    for (const s of sessions) {
      if (!s.starts_at || !s.room_id) continue;
      const start = toZonedTime(s.starts_at, timezone);
      if (start.toDateString() !== day.toDateString()) continue;
      const key = `${s.room_id}:${start.getHours()}:${Math.floor(start.getMinutes() / SLOT_MINUTES) * SLOT_MINUTES}`;
      map.set(key, s);
    }
    return map;
  }, [sessions, day, timezone]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const sessionId = String(active.id).replace(/^(pool|scheduled):/, "");
    const [, roomId, hourStr, minuteStr] = String(over.id).split(":");
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const duration = session.duration_minutes ?? 30;
    const start = slotInstant(day, hour, minute, timezone);
    const end = new Date(start.getTime() + duration * 60_000);
    onSchedule(sessionId, roomId ?? null, start.toISOString(), end.toISOString());
  }

  if (rooms.length === 0) {
    return (
      <div className="p-6">
        <EmptyState icon={Inbox} title="Add a room first" description="Create at least one room in Program Setup to schedule sessions." />
      </div>
    );
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex h-full min-h-0">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unscheduled</p>
            <span className="text-xs text-muted-foreground">{unscheduled.length}</span>
          </div>
          <div className="space-y-2">
            {unscheduled.map((session) => (
              <PoolCard key={session.id} session={session} rooms={rooms} day={day} timezone={timezone} onSchedule={onSchedule} />
            ))}
            {unscheduled.length === 0 && <p className="text-sm text-muted-foreground">Everything is scheduled.</p>}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {days.length > 1 && (
            <div className="flex items-center gap-1 border-b border-border px-4 py-2">
              {days.map((d, i) => (
                <Button key={i} size="sm" variant={i === dayIndex ? "default" : "ghost"} onClick={() => setDayIndex(i)}>
                  {format(d, "EEE MMM d")}
                </Button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-auto">
            <div className="grid" style={{ gridTemplateColumns: `80px repeat(${rooms.length}, minmax(180px, 1fr))` }}>
              <div className="sticky top-0 z-10 border-b border-r border-border bg-card" />
              {rooms.map((room) => (
                <div key={room.id} className="sticky top-0 z-10 border-b border-r border-border bg-card px-3 py-2 text-sm font-medium text-foreground">
                  {room.name}
                </div>
              ))}

              {slots.map((slot, slotIdx) => (
                <RowFragment key={slotIdx}>
                  <div className="border-b border-r border-border px-2 py-2 text-right text-xs text-muted-foreground">
                    {slot.minute === 0 ? format(wallClock(day, slot.hour, slot.minute), "h a") : ""}
                  </div>
                  {rooms.map((room) => {
                    const key = `${room.id}:${slot.hour}:${slot.minute}`;
                    const session = sessionsByCell.get(key);
                    return (
                      <Cell key={room.id} id={`cell:${room.id}:${slot.hour}:${slot.minute}`}>
                        {session && <ScheduledCard session={session} />}
                      </Cell>
                    );
                  })}
                </RowFragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DndContext>
  );
}

function RowFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Cell({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("min-h-11 border-b border-r border-border p-0.5", isOver && "bg-accent")}>
      {children}
    </div>
  );
}

function PoolCard({
  session,
  rooms,
  day,
  timezone,
  onSchedule,
}: {
  session: ProgramSession;
  rooms: Room[];
  day: Date;
  timezone: string;
  onSchedule: (sessionId: string, roomId: string | null, startsAt: string, endsAt: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `pool:${session.id}` });
  const [open, setOpen] = useState(false);
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [time, setTime] = useState("09:00");

  function schedule() {
    const [hour, minute] = time.split(":").map(Number);
    const start = slotInstant(day, hour ?? 9, minute ?? 0, timezone);
    const end = new Date(start.getTime() + (session.duration_minutes ?? 30) * 60_000);
    onSchedule(session.id, roomId || null, start.toISOString(), end.toISOString());
    setOpen(false);
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50, position: "relative" } : undefined}
      className={cn(
        "flex cursor-grab items-start gap-2 rounded-md border border-border bg-card p-2.5 text-sm active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
    >
      <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{session.title}</p>
        <p className="text-xs text-muted-foreground">{session.duration_minutes ?? 30} min</p>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {/* Drag is the primary interaction; this is the accessible/keyboard-friendly
           * fallback for placing a session without a pointer drag. */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={`Schedule ${session.title}`}
          >
            <CalendarPlus className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent onPointerDown={(e) => e.stopPropagation()}>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Room</label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Start time ({format(day, "MMM d")}, {timezone})
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <Button size="sm" className="w-full" onClick={schedule}>
              Schedule
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ScheduledCard({ session }: { session: ProgramSession }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `scheduled:${session.id}` });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50, position: "relative" } : undefined}
      className={cn("cursor-grab truncate rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground active:cursor-grabbing", isDragging && "opacity-50")}
      title={session.title}
    >
      {session.title}
    </div>
  );
}
