import type {
  PublicProgram,
  AuthUser,
  PublicEventSummary,
  PublicForm,
  SubmissionForm,
  SubmissionFormInput,
  SubmissionFormUpdateInput,
  SubmissionWriteInput,
  Submission,
  SubmitResponse,
} from "@opensession/schemas";
import { http } from "../client";

export const formsApi = {
  list: (eventId: string) => http.get<SubmissionForm[]>(`/api/v1/events/${eventId}/forms`),
  create: (eventId: string, input: SubmissionFormInput) =>
    http.post<SubmissionForm>(`/api/v1/events/${eventId}/forms`, input),
  get: (formId: string) => http.get<SubmissionForm>(`/api/v1/forms/${formId}`),
  update: (formId: string, input: SubmissionFormUpdateInput) =>
    http.patch<SubmissionForm>(`/api/v1/forms/${formId}`, input),
  publish: (formId: string) => http.post<SubmissionForm>(`/api/v1/forms/${formId}/publish`),
  close: (formId: string) => http.post<SubmissionForm>(`/api/v1/forms/${formId}/close`),
  duplicate: (formId: string) => http.post<SubmissionForm>(`/api/v1/forms/${formId}/duplicate`),
  remove: (formId: string) => http.delete<void>(`/api/v1/forms/${formId}`),
};

export const publicApi = {
  /** Everything the public widgets render, in one unauthenticated request. */
  getProgram: (eventSlug: string) => http.get<PublicProgram>(`/api/v1/public/events/${eventSlug}/program`),
  getEvent: (eventSlug: string) => http.get<PublicEventSummary>(`/api/v1/public/events/${eventSlug}`),
  /** Events with a published agenda — how the slugless public URLs find an event. */
  listEvents: () => http.get<PublicEventSummary[]>("/api/v1/public/events"),
  getForm: (eventSlug: string, formSlug: string) =>
    http.get<PublicForm>(`/api/v1/public/forms/${eventSlug}/${formSlug}`),
  requestCode: (eventSlug: string, formSlug: string, email: string) =>
    http.post<{ message: string; dev_code?: string | null }>(
      `/api/v1/public/forms/${eventSlug}/${formSlug}/auth/request-code`,
      { email },
    ),
  verify: (
    eventSlug: string,
    formSlug: string,
    email: string,
    code: string,
    name?: { first_name?: string; last_name?: string },
  ) =>
    http.post<AuthUser>(`/api/v1/public/forms/${eventSlug}/${formSlug}/auth/verify`, {
      email,
      code,
      ...name,
    }),
  createSubmission: (eventSlug: string, formSlug: string, input: SubmissionWriteInput) =>
    http.post<Submission>(`/api/v1/public/forms/${eventSlug}/${formSlug}/submissions`, input),
  updateSubmission: (submissionId: string, input: SubmissionWriteInput) =>
    http.patch<Submission>(`/api/v1/public/submissions/${submissionId}`, input),
  submit: (submissionId: string, input: SubmissionWriteInput) =>
    http.post<SubmitResponse>(`/api/v1/public/submissions/${submissionId}/submit`, input),
};
