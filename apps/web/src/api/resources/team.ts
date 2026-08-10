import type { ApiKey, ApiKeyCreated, EventRole, TeamMember } from "@opensession/schemas";
import { http } from "../client";

export const teamApi = {
  list: (eventId: string) => http.get<TeamMember[]>(`/api/v1/events/${eventId}/team`),
  add: (eventId: string, email: string, role: EventRole) =>
    http.post<TeamMember>(`/api/v1/events/${eventId}/team`, { email, role }),
  remove: (eventId: string, userId: string) => http.delete<{ ok: boolean }>(`/api/v1/events/${eventId}/team/${userId}`),
};

export const apiKeysApi = {
  list: (eventId: string) => http.get<ApiKey[]>(`/api/v1/events/${eventId}/api-keys`),
  create: (eventId: string, input: { name: string; scopes: string[]; expires_at?: string | null }) =>
    http.post<ApiKeyCreated>(`/api/v1/events/${eventId}/api-keys`, input),
  remove: (keyId: string) => http.delete<{ ok: boolean }>(`/api/v1/api-keys/${keyId}`),
};

// "events:write" is the scope the backend actually checks for most
// organizer-level routes (forms, evaluations, communications, dashboard,
// sessions, program setup — see require_event_role's default scope in
// apps/api/app/api/deps.py). Without it selectable here, a key could never
// satisfy those endpoints regardless of which other boxes were checked.
export const API_KEY_SCOPES = [
  "events:read",
  "events:write",
  "submissions:read",
  "submissions:write",
  "speakers:read",
  "speakers:write",
  "sessions:read",
  "sessions:write",
  "agenda:read",
  "agenda:write",
] as const;
