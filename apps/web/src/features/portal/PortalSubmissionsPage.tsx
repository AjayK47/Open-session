import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Pencil, AlertTriangle } from "lucide-react";
import { Button, Input, Label, Textarea, Badge } from "@opensession/ui";
import { toast } from "sonner";
import type { Submission } from "@opensession/schemas";
import { meApi, ApiError } from "../../api";
import { usePortalEvent } from "./usePortalEvent";
import { EmptyState } from "../../components/empty-state";
import { StatusPill, SUBMISSION_STATUS_TONE } from "../../components/status-pill";
import { PortalPageHeader } from "./PortalPageHeader";
import { sanitizeHtml } from "../../lib/sanitize-html";

/** Terminal states the API also refuses to edit — mirrored here only to decide
 *  whether to offer the button. The server remains the authority: it returns 409
 *  with a reason (including the form's edit-lock deadline, which the portal
 *  cannot see), and that message is what gets surfaced. */
export function PortalSubmissionsPage() {
  const { event } = usePortalEvent();
  const { data: submissions = [], isLoading } = useQuery({ queryKey: ["me", "submissions"], queryFn: meApi.submissions });
  const eventSubmissions = event ? submissions.filter((s) => s.event_id === event.id) : submissions;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title="My submissions"
        description="Everything you've submitted to this event, and its current status."
      />
      {!isLoading && eventSubmissions.length === 0 ? (
        <EmptyState icon={FileText} title="No submissions yet" />
      ) : (
        <div className="space-y-3">
          {eventSubmissions.map((submission) => (
            <SubmissionCard key={submission.id} submission={submission} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubmissionCard({ submission }: { submission: Submission }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(submission.title ?? "");
  const [description, setDescription] = useState(submission.description ?? "");
  const [language, setLanguage] = useState(submission.language ?? "");

  const locked = submission.can_edit === false;

  const save = useMutation({
    mutationFn: () => meApi.editSubmission(submission.id, { title, description, language: language || null }),
    onSuccess: () => {
      toast.success("Submission updated");
      void queryClient.invalidateQueries({ queryKey: ["me", "submissions"] });
      setEditing(false);
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message2 : "Could not update this submission"),
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      {locked && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="size-4 shrink-0" />
          <p>{submission.edit_lock_reason ?? `This submission is locked because it has been ${submission.status}. Editing is no longer available.`}</p>
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-foreground">{submission.title || "Untitled"}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill label={submission.status} tone={SUBMISSION_STATUS_TONE[submission.status] ?? "neutral"} />
          {!editing && !locked && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`title-${submission.id}`}>Title</Label>
            <Input id={`title-${submission.id}`} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`lang-${submission.id}`}>Language</Label>
            <Input id={`lang-${submission.id}`} value={language} onChange={(e) => setLanguage(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`desc-${submission.id}`}>Description</Label>
            <Textarea
              id={`desc-${submission.id}`}
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTitle(submission.title ?? "");
                setDescription(submission.description ?? "");
                setLanguage(submission.language ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !title.trim()}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-4">
          {submission.description && (
            <div
              className="prose prose-sm dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(submission.description) }}
            />
          )}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground border-t border-border pt-3">
            {submission.reference_code && (
              <Badge variant="outline" className="font-mono">{submission.reference_code}</Badge>
            )}
            {((submission as any).track?.name || (submission as any).track_name) && (
              <StatusPill label={(submission as any).track?.name || (submission as any).track_name} tone="neutral" />
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {submission.capacity != null && (
                <div><span className="font-medium text-foreground">Capacity:</span> {submission.capacity}</div>
              )}
              {submission.ceu_credits != null && (
                <div><span className="font-medium text-foreground">CEU Credits:</span> {submission.ceu_credits}</div>
              )}
              {submission.language && (
                <div><span className="font-medium text-foreground">Language:</span> {submission.language}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
