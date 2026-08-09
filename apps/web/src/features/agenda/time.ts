import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { Event } from "@opensession/schemas";

/**
 * Shared scheduling-time helpers for the agenda views.
 *
 * All the Date objects these produce (`eventDays`, `wallClock`) are "fake local"
 * — their y/m/d/h/m fields, read via ordinary local getters, represent
 * wall-clock time *in the event's timezone*, not the browser's. That's
 * deliberate: it lets every display/grid calculation use plain local Date math,
 * with `fromZonedTime`/`toZonedTime` only at the two boundaries where we
 * actually cross into a real UTC instant (talking to the API) or out of one
 * (reading `session.starts_at`).
 *
 * Scheduling a session for an event configured in a different timezone than the
 * organizer's browser must not shift by that offset. This lives in one module
 * so the Day and Week grids cannot drift apart on that rule.
 */

export const SLOT_MINUTES = 30;
export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 20;

/** Every calendar day the event spans, in the event's timezone. */
export function eventDays(event?: Event): Date[] {
  const tz = event?.timezone || "UTC";
  if (!event?.starts_at || !event.ends_at) return [new Date()];
  const start = toZonedTime(event.starts_at, tz);
  const end = toZonedTime(event.ends_at, tz);
  const days: Date[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= last) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days.length > 0 ? days : [start];
}

export function slotsForDay(): { hour: number; minute: number }[] {
  const slots: { hour: number; minute: number }[] = [];
  for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) slots.push({ hour: h, minute: m });
  }
  return slots;
}

/** A slot's wall-clock Date, for display only — no timezone conversion needed. */
export function wallClock(day: Date, hour: number, minute: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
}

/** The real UTC instant for a slot, treating (day, hour, minute) as wall-clock
 *  time in the event's timezone — this is what actually gets sent to the API. */
export function slotInstant(day: Date, hour: number, minute: number, timezone: string): Date {
  return fromZonedTime(wallClock(day, hour, minute), timezone);
}

/** Snaps a session's UTC start to the (day, hour, minute) grid cell it occupies. */
export function cellForSession(startsAt: string, timezone: string): { day: Date; hour: number; minute: number } {
  const start = toZonedTime(startsAt, timezone);
  return {
    day: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
    hour: start.getHours(),
    minute: Math.floor(start.getMinutes() / SLOT_MINUTES) * SLOT_MINUTES,
  };
}

export function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}
