import type {
  AgendaItem,
  Conflict,
  ProgramSession,
  ScheduleInput,
  SessionCreateInput,
  SessionImportPreview,
  SessionRevision,
  SessionUpdateInput,
} from "@opensession/schemas";
import { http, qs } from "../client";

export const sessionsApi = {
  list: (
    eventId: string,
    filters?: { status?: string; track_id?: string; room_id?: string; unscheduled?: boolean },
  ) => http.get<ProgramSession[]>(`/api/v1/events/${eventId}/sessions${qs(filters ?? {})}`),
  create: (eventId: string, input: SessionCreateInput) =>
    http.post<ProgramSession>(`/api/v1/events/${eventId}/sessions`, input),
  get: (sessionId: string) => http.get<ProgramSession>(`/api/v1/sessions/${sessionId}`),
  update: (sessionId: string, input: SessionUpdateInput) =>
    http.patch<ProgramSession>(`/api/v1/sessions/${sessionId}`, input),
  revisions: (sessionId: string) => http.get<SessionRevision[]>(`/api/v1/sessions/${sessionId}/revisions`),
  restoreRevision: (sessionId: string, revisionId: string) =>
    http.post<ProgramSession>(`/api/v1/sessions/${sessionId}/revisions/${revisionId}/restore`),
  schedule: (sessionId: string, input: ScheduleInput) =>
    http.patch<ProgramSession>(`/api/v1/sessions/${sessionId}/schedule`, input),
  agenda: (eventId: string) => http.get<AgendaItem[]>(`/api/v1/events/${eventId}/agenda`),
  /** Goes live: approves scheduled sessions and opens the public widgets. */
  publishAgenda: (eventId: string) =>
    http.post<{ published_sessions: number; agenda_published_at: string; public_url: string }>(
      `/api/v1/events/${eventId}/agenda/publish`,
      {},
    ),
  autoSchedule: (eventId: string) =>
    http.post<{ placed: number; skipped: number; unscheduled_before: number }>(
      `/api/v1/events/${eventId}/agenda/auto-schedule`,
      {},
    ),
  conflicts: (eventId: string) => http.get<Conflict[]>(`/api/v1/events/${eventId}/conflicts`),
  /** Dry run: parses the CSV and reports per-row errors without writing. */
  importPreview: (eventId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return http.postForm<SessionImportPreview>(`/api/v1/events/${eventId}/sessions/import/preview`, body);
  },
  importCommit: (eventId: string, rows: Record<string, string>[], mapping: Record<string, string>) =>
    http.post<{ created_ids: string[]; count: number; errors: string[] }>(
      `/api/v1/events/${eventId}/sessions/import/commit`,
      { rows, mapping },
    ),
};
