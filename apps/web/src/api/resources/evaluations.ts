import type {
  AiReviewRun,
  EvaluationPlan,
  EvaluationPlanInput,
  EvaluationPlanUpdateInput,
  EvaluationResult,
  ReviewerAssignment,
  ReviewerProgress,
  ReviewWriteInput,
} from "@opensession/schemas";
import { apiUrl, http } from "../client";

export const evaluationsApi = {
  list: (eventId: string) => http.get<EvaluationPlan[]>(`/api/v1/events/${eventId}/evaluation-plans`),
  create: (eventId: string, input: EvaluationPlanInput) =>
    http.post<EvaluationPlan>(`/api/v1/events/${eventId}/evaluation-plans`, input),
  get: (planId: string) => http.get<EvaluationPlan>(`/api/v1/evaluation-plans/${planId}`),
  update: (planId: string, input: EvaluationPlanUpdateInput) =>
    http.patch<EvaluationPlan>(`/api/v1/evaluation-plans/${planId}`, input),
  assign: (planId: string, input: {
    reviewers: string[];
    submission_ids?: string[];
    strategy?: "every" | "distribute";
    per_reviewer_cap?: number | null;
    track_ids?: string[];
    due_at?: string | null;
  }) => http.post<{ assigned: number }>(`/api/v1/evaluation-plans/${planId}/assignments`, input),
  progress: (planId: string) => http.get<ReviewerProgress[]>(`/api/v1/evaluation-plans/${planId}/progress`),
  results: (planId: string) => http.get<EvaluationResult[]>(`/api/v1/evaluation-plans/${planId}/results`),
  remind: (planId: string) => http.post<{ sent: number }>(`/api/v1/evaluation-plans/${planId}/remind`),
  exportUrl: (eventId: string) => apiUrl(`/api/v1/events/${eventId}/reviews/export.csv`),
  aiReviews: (planId: string, submissionId: string) =>
    http.get<AiReviewRun[]>(`/api/v1/evaluation-plans/${planId}/ai-reviews/${submissionId}`),
  runAiReview: (planId: string, submissionId: string, idempotencyKey: string) =>
    http.post<AiReviewRun>(`/api/v1/evaluation-plans/${planId}/ai-reviews/${submissionId}`, undefined, {
      "Idempotency-Key": idempotencyKey,
    }),
  overrideAiReview: (planId: string, runId: string, score: number, reason: string) =>
    http.patch<AiReviewRun>(`/api/v1/evaluation-plans/${planId}/ai-reviews/${runId}/override`, { score, reason }),
  myAssignments: () => http.get<ReviewerAssignment[]>("/api/v1/reviewer/assignments"),
  submitReview: (assignmentId: string, input: ReviewWriteInput) =>
    http.post<{ assignment_id: string; status: string; weighted_score: number }>(
      `/api/v1/review-assignments/${assignmentId}/review`,
      input,
    ),
  recuse: (assignmentId: string, reason?: string) =>
    http.post<{ assignment_id: string; status: string }>(`/api/v1/review-assignments/${assignmentId}/recuse`, {
      reason: reason ?? null,
    }),
};
