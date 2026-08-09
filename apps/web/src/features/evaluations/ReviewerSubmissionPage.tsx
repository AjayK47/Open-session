import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@opensession/ui";
import { toast } from "sonner";
import { evaluationsApi, submissionsApi, ApiError } from "../../api";
import { sanitizeHtml } from "../../lib/sanitize-html";

export function ReviewerSubmissionPage() {
  const { submissionId, eventSlug } = useParams<{ submissionId: string; eventSlug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [scores, setScores] = useState<Record<string, unknown>>({});
  const [comments, setComments] = useState("");

  const { data: assignments } = useQuery({ queryKey: ["reviewer-assignments"], queryFn: evaluationsApi.myAssignments });
  const assignment = assignments?.find((a) => a.submission_id === submissionId);

  const { data: submission } = useQuery({
    queryKey: ["submissions", "detail", submissionId],
    queryFn: () => submissionsApi.get(submissionId!),
    enabled: Boolean(submissionId),
  });

  const { data: plan } = useQuery({
    queryKey: ["evaluation-plans", "detail", assignment?.plan_id],
    queryFn: () => evaluationsApi.get(assignment!.plan_id!),
    enabled: Boolean(assignment?.plan_id),
  });

  useEffect(() => {
    if (plan && assignment) {
      setScores(assignment.scores ?? {});
      setComments(assignment.comments ?? "");
    }
  }, [plan, assignment]);

  const save = useMutation({
    mutationFn: (submit: boolean) => evaluationsApi.submitReview(assignment!.id, { scores, comments, submit }),
    onSuccess: (_res, submit) => {
      toast.success(submit ? "Review submitted" : "Draft saved");
      void queryClient.invalidateQueries({ queryKey: ["reviewer-assignments"] });
      if (submit) navigate(`/review/${eventSlug}`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save review"),
  });

  const recuse = useMutation({
    mutationFn: () => evaluationsApi.recuse(assignment!.id),
    onSuccess: () => {
      toast.success("You have been recused from this submission");
      void queryClient.invalidateQueries({ queryKey: ["reviewer-assignments"] });
      navigate(`/review/${eventSlug}`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not recuse"),
  });

  if (!submission || !assignment) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to assignments
      </button>

      <div>
        <h1 className="text-xl font-semibold text-foreground">{submission.title}</h1>
        <div className="prose prose-sm mt-3 dark:prose-invert" dangerouslySetInnerHTML={{ __html: sanitizeHtml(submission.description || "") }} />
      </div>

      {(submission.participants ?? []).length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Participants</p>
          <p className="text-sm text-muted-foreground">
            {submission.participants!.map((p) => [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email).join(", ")}
          </p>
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-border p-4">
        <p className="text-sm font-semibold text-foreground">Scoring rubric</p>
        {plan?.criteria.map((criterion) => (
          <div key={criterion.key} className="space-y-1.5">
            <Label>
              {criterion.label} {criterion.type === "numeric" ? `(1–${criterion.scale_max ?? 5})` : ""}
            </Label>
            {criterion.description && <p className="text-xs text-muted-foreground">{criterion.description}</p>}
            {criterion.type === "numeric" ? (
              <Input
                type="number"
                min={1}
                max={criterion.scale_max ?? 5}
                value={Number.isFinite(Number(scores[criterion.key])) ? Number(scores[criterion.key]) : ""}
                onChange={(e) => setScores((s) => ({ ...s, [criterion.key]: Number(e.target.value) }))}
                className="w-24"
              />
            ) : criterion.type === "yes_no" ? (
              <Select
                value={scores[criterion.key] === true ? "yes" : scores[criterion.key] === false ? "no" : ""}
                onValueChange={(value) => setScores((current) => ({ ...current, [criterion.key]: value === "yes" }))}
              >
                <SelectTrigger className="w-40"><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
              </Select>
            ) : criterion.type === "dropdown" ? (
              <Select
                value={String(scores[criterion.key] ?? "")}
                onValueChange={(value) => setScores((current) => ({ ...current, [criterion.key]: value }))}
              >
                <SelectTrigger><SelectValue placeholder="Choose an option…" /></SelectTrigger>
                <SelectContent>{(criterion.options ?? []).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <Textarea rows={3} value={String(scores[criterion.key] ?? "")} onChange={(e) => setScores((current) => ({ ...current, [criterion.key]: e.target.value }))} />
            )}
          </div>
        ))}
        <div className="space-y-1.5">
          <Label>Comments</Label>
          <Textarea rows={4} value={comments} onChange={(e) => setComments(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending}>
            Save draft
          </Button>
          <Button onClick={() => save.mutate(true)} disabled={save.isPending}>
            Submit review
          </Button>
          <Button variant="ghost" className="ml-auto text-destructive" onClick={() => recuse.mutate()} disabled={recuse.isPending}>
            <ShieldAlert className="h-4 w-4" />
            Recuse myself
          </Button>
        </div>
      </div>
    </div>
  );
}
