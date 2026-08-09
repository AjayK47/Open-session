import type { TaskAssignment, TaskTemplate, TaskTemplateInput, TaskTemplateUpdateInput } from "@opensession/schemas";
import { http, qs } from "../client";

export const tasksApi = {
  listTemplates: (eventId: string) => http.get<TaskTemplate[]>(`/api/v1/events/${eventId}/task-templates`),
  /** Seeds the six default onboarding tasks (and the two portal forms two of
   *  them need). Idempotent — re-running skips names the event already has. */
  createStarterPack: (eventId: string) =>
    http.post<{ created: number; skipped: number }>(`/api/v1/events/${eventId}/task-templates/starter-pack`),
  createTemplate: (eventId: string, input: TaskTemplateInput) =>
    http.post<TaskTemplate>(`/api/v1/events/${eventId}/task-templates`, input),
  updateTemplate: (templateId: string, input: TaskTemplateUpdateInput) =>
    http.patch<TaskTemplate>(`/api/v1/task-templates/${templateId}`, input),
  /** Clones templates from another event; caller needs write access to both. */
  copyTemplatesFrom: (eventId: string, sourceEventId: string, templateIds: string[]) =>
    http.post<{ templates: TaskTemplate[] }>(`/api/v1/events/${eventId}/task-templates/copy-from`, {
      source_event_id: sourceEventId,
      template_ids: templateIds,
    }),
  listAssignments: (eventId: string, filters?: { status?: string; overdue?: boolean }) =>
    http.get<TaskAssignment[]>(`/api/v1/events/${eventId}/task-assignments${qs(filters ?? {})}`),
  generateAssignments: (eventId: string, personId: string, sessionId?: string, submissionId?: string) =>
    http.post<{ created: number }>(`/api/v1/events/${eventId}/task-assignments/generate`, {
      person_id: personId,
      session_id: sessionId,
      submission_id: submissionId,
    }),
  assignTemplate: (eventId: string, templateId: string, personIds: string[], dueAt?: string, sessionId?: string) =>
    http.post<{ created: number; assignments: TaskAssignment[] }>(`/api/v1/events/${eventId}/task-assignments/batch`, {
      template_id: templateId,
      person_ids: personIds,
      due_at: dueAt,
      session_id: sessionId,
    }),
  complete: (assignmentId: string, completionData?: Record<string, unknown>) =>
    http.post<TaskAssignment>(`/api/v1/task-assignments/${assignmentId}/complete`, {
      completion_data: completionData,
    }),
  remind: (eventId: string, assignmentIds: string[]) =>
    http.post<{ sent: number }>("/api/v1/task-assignments/remind", {
      event_id: eventId,
      assignment_ids: assignmentIds,
    }),
};
