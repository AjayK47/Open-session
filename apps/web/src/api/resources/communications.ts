import type {
  Automation,
  AutomationInput,
  AutomationUpdateInput,
  Communication,
  EmailTemplate,
  EmailTemplateInput,
  EmailTemplateUpdateInput,
  ManualSendInput,
  ManualSendPreview,
} from "@opensession/schemas";
import { http, qs } from "../client";

export const communicationsApi = {
  listTemplates: (eventId: string) => http.get<EmailTemplate[]>(`/api/v1/events/${eventId}/email-templates`),
  createTemplate: (eventId: string, input: EmailTemplateInput) =>
    http.post<EmailTemplate>(`/api/v1/events/${eventId}/email-templates`, input),
  getTemplate: (templateId: string) => http.get<EmailTemplate>(`/api/v1/email-templates/${templateId}`),
  updateTemplate: (templateId: string, input: EmailTemplateUpdateInput) =>
    http.patch<EmailTemplate>(`/api/v1/email-templates/${templateId}`, input),

  listAutomations: (eventId: string) => http.get<Automation[]>(`/api/v1/events/${eventId}/automations`),
  createAutomation: (eventId: string, input: AutomationInput) =>
    http.post<Automation>(`/api/v1/events/${eventId}/automations`, input),
  updateAutomation: (automationId: string, input: AutomationUpdateInput) =>
    http.patch<Automation>(`/api/v1/automations/${automationId}`, input),

  history: (eventId: string, status?: string) =>
    http.get<Communication[]>(`/api/v1/events/${eventId}/communications${qs({ status })}`),
  sendManual: (eventId: string, input: ManualSendInput) =>
    http.post<{ sent: number }>(`/api/v1/events/${eventId}/communications/send`, input),
  previewManual: (eventId: string, input: ManualSendInput) =>
    http.post<ManualSendPreview>(`/api/v1/events/${eventId}/communications/preview`, input),
};

export const EMAIL_TEMPLATE_TYPES = [
  "submission_received",
  "submission_accepted",
  "submission_declined",
  "task_reminder",
  "speaker_confirmation",
  "session_scheduled",
  "session_schedule_changed",
  "calendar_invite",
] as const;

export const AUTOMATION_TRIGGERS = [
  "submission_received",
  "submission_accepted",
  "submission_declined",
  "task_assigned",
  "task_overdue",
  "session_scheduled",
  "session_schedule_changed",
] as const;
