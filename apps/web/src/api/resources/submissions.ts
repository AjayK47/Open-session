import type { ManualSubmissionInput, Submission, SubmissionEvent, SubmissionUpdateInput } from "@opensession/schemas";
import { apiUrl, http, qs } from "../client";

/** Optional note + notify toggle carried by a decision. The note is included in
 *  the accept/decline email so a decision can ask for changes or give feedback. */
export interface DecisionOptions {
  notify?: boolean;
  message?: string | null;
}

export const submissionsApi = {
  list: (eventId: string, filters?: { status?: string; form_id?: string; track_id?: string }) =>
    http.get<Submission[]>(`/api/v1/events/${eventId}/submissions${qs(filters ?? {})}`),
  createManual: (eventId: string, input: ManualSubmissionInput) =>
    http.post<Submission>(`/api/v1/events/${eventId}/submissions`, input),
  bulkDecision: (eventId: string, submissionIds: string[], target: string, options?: DecisionOptions) =>
    http.post<{ updated: number }>(`/api/v1/events/${eventId}/submissions/bulk-decision`, {
      submission_ids: submissionIds,
      target,
      notify: options?.notify ?? true,
      message: options?.message || null,
    }),
  exportCsvUrl: (eventId: string) => apiUrl(`/api/v1/events/${eventId}/submissions/export.csv`),
  exportXlsxUrl: (eventId: string) => apiUrl(`/api/v1/events/${eventId}/submissions/export.xlsx`),
  /** Zip of every stored file for the given submissions (all of them when empty). */
  filesBundleUrl: (eventId: string, submissionIds: string[] = []) =>
    apiUrl(
      `/api/v1/events/${eventId}/files/bundle.zip` +
        (submissionIds.length
          ? `?${submissionIds.map((id) => `submission_ids=${encodeURIComponent(id)}`).join("&")}`
          : ""),
    ),
  events: (submissionId: string) => http.get<SubmissionEvent[]>(`/api/v1/submissions/${submissionId}/events`),
  get: (submissionId: string) => http.get<Submission>(`/api/v1/submissions/${submissionId}`),
  update: (submissionId: string, input: SubmissionUpdateInput) =>
    http.patch<Submission>(`/api/v1/submissions/${submissionId}`, input),
  organizerSubmit: (submissionId: string) => http.post<Submission>(`/api/v1/submissions/${submissionId}/submit`),
  decide: (submissionId: string, decision: string, options?: DecisionOptions) =>
    http.post<Submission>(`/api/v1/submissions/${submissionId}/decision`, {
      decision,
      notify: options?.notify ?? true,
      message: options?.message || null,
    }),
};

export const SUBMISSION_STATUS_TABS = [
  { key: "all", label: "All", status: undefined },
  { key: "accepted", label: "Accepted", status: "accepted" },
  { key: "accept_queue", label: "Accept Queue", status: "accept_queue" },
  { key: "pending", label: "Pending", status: "pending_review" },
  { key: "decline_queue", label: "Decline Queue", status: "decline_queue" },
  { key: "declined", label: "Declined", status: "declined" },
  { key: "withdrawn", label: "Withdrawn", status: "withdrawn" },
  { key: "draft", label: "Drafts", status: "draft" },
] as const;
