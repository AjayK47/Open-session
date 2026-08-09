import { cn } from "@opensession/ui";

/**
 * Colored status pill (frontend plan §5.2). Tone drives color only — callers pick
 * the tone that matches the semantic meaning of a given status string, since status
 * vocabularies differ per resource (submissions, sessions, tasks, communications...).
 */
export type PillTone = "neutral" | "positive" | "attention" | "negative" | "info";

const TONE_CLASSES: Record<PillTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  positive: "bg-success/15 text-success",
  attention: "bg-warning/15 text-warning",
  negative: "bg-destructive/15 text-destructive",
  info: "bg-accent text-accent-foreground",
};

export function StatusPill({
  label,
  tone = "neutral",
  className,
}: {
  label: string;
  tone?: PillTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {label.replace(/_/g, " ")}
    </span>
  );
}

// --- Domain status → tone mappings -----------------------------------------

export const SUBMISSION_STATUS_TONE: Record<string, PillTone> = {
  draft: "neutral",
  submitted: "info",
  pending_review: "attention",
  accept_queue: "positive",
  decline_queue: "attention",
  accepted: "positive",
  declined: "negative",
  withdrawn: "neutral",
};

export const SESSION_STATUS_TONE: Record<string, PillTone> = {
  draft: "neutral",
  confirmed: "info",
  scheduled: "positive",
  published: "positive",
  cancelled: "negative",
};

export const TASK_STATUS_TONE: Record<string, PillTone> = {
  open: "attention",
  completed: "positive",
  overdue: "negative",
};

export const REVIEW_STATUS_TONE: Record<string, PillTone> = {
  assigned: "neutral",
  in_progress: "attention",
  completed: "positive",
};

export const COMMUNICATION_STATUS_TONE: Record<string, PillTone> = {
  queued: "neutral",
  sending: "attention",
  sent: "positive",
  failed: "negative",
};

export const FORM_STATUS_TONE: Record<string, PillTone> = {
  draft: "neutral",
  open: "positive",
  closed: "negative",
};

/** The state-machine transitions a submission may move to from a given status (plan §20). */
export const SUBMISSION_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "withdrawn"],
  submitted: ["pending_review", "accept_queue", "decline_queue", "accepted", "declined", "withdrawn"],
  pending_review: ["accept_queue", "decline_queue", "accepted", "declined", "withdrawn"],
  accept_queue: ["accepted", "decline_queue", "declined", "withdrawn"],
  decline_queue: ["declined", "accept_queue", "accepted", "withdrawn"],
  accepted: ["withdrawn", "declined"],
  declined: ["accepted", "withdrawn"],
  withdrawn: [],
};
