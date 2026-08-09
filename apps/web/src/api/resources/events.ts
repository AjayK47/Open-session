import type { Event, EventCreateInput, EventUpdateInput } from "@opensession/schemas";
import { http } from "../client";

export const eventsApi = {
  list: () => http.get<Event[]>("/api/v1/events"),
  create: (input: EventCreateInput) => http.post<Event>("/api/v1/events", input),
  get: (eventId: string) => http.get<Event>(`/api/v1/events/${eventId}`),
  update: (eventId: string, input: EventUpdateInput) => http.patch<Event>(`/api/v1/events/${eventId}`, input),
};
