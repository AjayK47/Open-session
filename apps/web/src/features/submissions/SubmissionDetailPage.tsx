import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Tabs, TabsContent, TabsList, TabsTrigger } from "@opensession/ui";
import { toast } from "sonner";
import { submissionsApi, programApi, ApiError } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { StatusPill, SUBMISSION_STATUS_TONE, SUBMISSION_TRANSITIONS } from "../../components/status-pill";
import { DecisionDialog, type DecisionPayload } from "./DecisionDialog";
import { TrackPill } from "../../components/track-tag-picker";
import { sanitizeHtml } from "../../lib/sanitize-html";

export function SubmissionDetailPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const { eventId } = useCurrentEvent();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: submission, isLoading } = useQuery({
    queryKey: ["submissions", "detail", submissionId],
    queryFn: () => submissionsApi.get(submissionId!),
    enabled: Boolean(submissionId),
  });
  const { data: tracks = [] } = useQuery({ queryKey: ["tracks", eventId], queryFn: () => programApi.tracks.list(eventId) });

  // Accept/decline route through a dialog so a note can ride along; the other
  // queue moves are reversible bookkeeping and stay one-click.
  const [pendingDecision, setPendingDecision] = useState<"accepted" | "declined" | null>(null);

  const decide = useMutation({
    mutationFn: ({ target, options }: { target: string; options?: DecisionPayload }) =>
      submissionsApi.decide(submissionId!, target, options ?? undefined),
    onSuccess: (updated) => {
      toast.success(`Marked ${updated.status.replace(/_/g, " ")}`);
      setPendingDecision(null);
      void queryClient.invalidateQueries({ queryKey: ["submissions"] });
      void queryClient.setQueryData(["submissions", "detail", submissionId], updated);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not update status"),
  });

  if (isLoading || !submission) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;

  const track = tracks.find((t) => t.id === submission.track_id);
  const transitions = SUBMISSION_TRANSITIONS[submission.status] ?? [];

  return (
    <div>
      <div className="border-b border-border px-6 py-5">
        <button onClick={() => navigate(`/app/events/${eventId}/submissions`)} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to submissions
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">{submission.title || "Untitled"}</h1>
              <StatusPill label={submission.status} tone={SUBMISSION_STATUS_TONE[submission.status] ?? "neutral"} />
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              {track && <TrackPill id={track.id} name={track.name} />}
              {submission.aggregate_rating !== null && <span>Rating: {submission.aggregate_rating}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {transitions.includes("accepted") && (
              <Button size="sm" onClick={() => setPendingDecision("accepted")}>
                <CheckCircle2 className="h-4 w-4" />
                Accept
              </Button>
            )}
            {transitions.includes("declined") && (
              <Button size="sm" variant="outline" onClick={() => setPendingDecision("declined")}>
                <XCircle className="h-4 w-4" />
                Decline
              </Button>
            )}
            {transitions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Clock className="h-4 w-4" />
                    Change status
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {transitions.map((status) => (
                    <DropdownMenuItem key={status} onSelect={() => decide.mutate({ target: status })}>
                      {status.replace(/_/g, " ")}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="participants">Participants</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 max-w-2xl space-y-4">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</p>
              <div className="prose prose-sm dark:prose-invert" dangerouslySetInnerHTML={{ __html: sanitizeHtml(submission.description || "<p>No description</p>") }} />
            </div>
            {submission.tags.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {submission.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(submission.reference_code != null || submission.capacity != null || submission.ceu_credits != null || submission.client_session_id != null || submission.language != null || submission.starts_at != null || submission.ends_at != null) && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Details</p>
                <div className="grid grid-cols-2 gap-4 rounded-lg border border-border p-4 text-sm">
                  {submission.reference_code != null && (
                    <div>
                      <p className="text-muted-foreground">Reference Code</p>
                      <p className="font-medium text-foreground">{submission.reference_code}</p>
                    </div>
                  )}
                  {submission.capacity != null && (
                    <div>
                      <p className="text-muted-foreground">Capacity</p>
                      <p className="font-medium text-foreground">{submission.capacity}</p>
                    </div>
                  )}
                  {submission.ceu_credits != null && (
                    <div>
                      <p className="text-muted-foreground">CEU Credits</p>
                      <p className="font-medium text-foreground">{submission.ceu_credits}</p>
                    </div>
                  )}
                  {submission.client_session_id != null && (
                    <div>
                      <p className="text-muted-foreground">Client Session ID</p>
                      <p className="font-medium text-foreground">{submission.client_session_id}</p>
                    </div>
                  )}
                  {submission.language != null && (
                    <div>
                      <p className="text-muted-foreground">Language</p>
                      <p className="font-medium text-foreground">{submission.language}</p>
                    </div>
                  )}
                  {submission.starts_at != null && (
                    <div>
                      <p className="text-muted-foreground">Proposed Start</p>
                      <p className="font-medium text-foreground">{new Date(submission.starts_at).toLocaleString()}</p>
                    </div>
                  )}
                  {submission.ends_at != null && (
                    <div>
                      <p className="text-muted-foreground">Proposed End</p>
                      <p className="font-medium text-foreground">{new Date(submission.ends_at).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="participants" className="mt-4 space-y-3">
            {(submission.participants ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No participants.</p>
            ) : (
              submission.participants!.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {[p.first_name, p.last_name].filter(Boolean).join(" ") || p.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.email} {p.company ? `· ${p.company}` : ""}
                    </p>
                  </div>
                  <span className="text-xs capitalize text-muted-foreground">{p.role}</span>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="reviews" className="mt-4 space-y-3">
            {submission.review_summary ? (
              <>
                <div className="flex gap-6 text-sm">
                  <span>
                    <span className="font-medium text-foreground">{submission.review_summary.completed}</span> / {submission.review_summary.total} reviews complete
                  </span>
                  <span>
                    Aggregate: <span className="font-medium text-foreground">{submission.review_summary.aggregate_rating ?? "—"}</span>
                  </span>
                </div>
                {submission.review_summary.reviews.map((r) => (
                  <div key={r.assignment_id} className="rounded-lg border border-border p-3 text-sm">
                    <p className="font-medium text-foreground">Score: {r.weighted_score ?? "—"}</p>
                    {r.comments && <p className="mt-1 text-muted-foreground">{r.comments}</p>}
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not yet assigned to an evaluation plan.{" "}
                <Link to={`/app/events/${eventId}/evaluations`} className="text-primary hover:underline">
                  Assign one
                </Link>
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <DecisionDialog
        open={pendingDecision !== null}
        onOpenChange={(next) => !next && setPendingDecision(null)}
        decision={pendingDecision}
        isPending={decide.isPending}
        onConfirm={(options) => decide.mutate({ target: pendingDecision!, options })}
      />
    </div>
  );
}
