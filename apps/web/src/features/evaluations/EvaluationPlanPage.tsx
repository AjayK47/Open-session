import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, ArrowUpDown, Download, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@opensession/ui";
import { toast } from "sonner";
import type { CriterionConfig, EvaluationPlanInput } from "@opensession/schemas";
import { evaluationsApi, submissionsApi, ApiError } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";

const CRITERION_TYPES = ["numeric", "dropdown", "yes_no", "text"];

function toLocalDateTime(value?: string | null) {
  return value ? value.slice(0, 16) : "";
}

function emptyDraft(): EvaluationPlanInput {
  return {
    name: "",
    instructions: "",
    scope: {},
    criteria: [{ key: "overall", label: "Overall quality", type: "numeric", scale_max: 5, weight: 1, required: true }],
    reviews_required: 2,
    blind_review: false,
    round_number: 1,
    opens_at: null,
    closes_at: null,
  };
}

export function EvaluationPlanPage() {
  const { eventId } = useCurrentEvent();
  const { planId } = useParams<{ planId: string }>();
  const isNew = !planId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<EvaluationPlanInput>(emptyDraft());
  const [reviewerEmails, setReviewerEmails] = useState("");
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<string[]>([]);
  const [assignmentStrategy, setAssignmentStrategy] = useState<"every" | "distribute">("every");
  const [reviewerCap, setReviewerCap] = useState("");
  const [assignmentDueAt, setAssignmentDueAt] = useState("");
  const [scoreDescending, setScoreDescending] = useState(true);
  const [aiSubmissionId, setAiSubmissionId] = useState<string | null>(null);
  const [overrideScore, setOverrideScore] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const { data: existing } = useQuery({
    queryKey: ["evaluation-plans", "detail", planId],
    queryFn: () => evaluationsApi.get(planId!),
    enabled: Boolean(planId),
  });
  const { data: submissions = [] } = useQuery({
    queryKey: ["submissions", eventId, "evaluation-assignment"],
    queryFn: () => submissionsApi.list(eventId),
    enabled: !isNew,
  });
  const { data: progress = [] } = useQuery({
    queryKey: ["evaluation-plans", planId, "progress"],
    queryFn: () => evaluationsApi.progress(planId!),
    enabled: !isNew,
  });
  const { data: results = [] } = useQuery({
    queryKey: ["evaluation-plans", planId, "results"],
    queryFn: () => evaluationsApi.results(planId!),
    enabled: !isNew,
  });
  const { data: aiRuns = [] } = useQuery({
    queryKey: ["evaluation-plans", planId, "ai-reviews", aiSubmissionId],
    queryFn: () => evaluationsApi.aiReviews(planId!, aiSubmissionId!),
    enabled: !isNew && Boolean(aiSubmissionId),
  });
  useEffect(() => {
    if (existing) {
      setDraft({
        name: existing.name,
        instructions: existing.instructions ?? "",
        scope: existing.scope,
        criteria: existing.criteria,
        reviews_required: existing.reviews_required,
        blind_review: existing.blind_review,
        round_number: existing.round_number,
        opens_at: existing.opens_at,
        closes_at: existing.closes_at,
      });
    }
  }, [existing]);

  const save = useMutation({
    mutationFn: () => (isNew ? evaluationsApi.create(eventId, draft) : evaluationsApi.update(planId!, draft)),
    onSuccess: (plan) => {
      toast.success("Evaluation plan saved");
      void queryClient.invalidateQueries({ queryKey: ["evaluation-plans", eventId] });
      if (isNew) navigate(`/app/events/${eventId}/evaluations/${plan.id}`, { replace: true });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save plan"),
  });

  const assign = useMutation({
    mutationFn: () =>
      evaluationsApi.assign(
        planId!,
        {
          reviewers: reviewerEmails.split(",").map((e) => e.trim()).filter(Boolean),
          submission_ids: selectedSubmissionIds.length ? selectedSubmissionIds : undefined,
          strategy: assignmentStrategy,
          per_reviewer_cap: reviewerCap ? Number(reviewerCap) : null,
          due_at: assignmentDueAt ? new Date(assignmentDueAt).toISOString() : null,
        },
      ),
    onSuccess: (res) => {
      toast.success(`Assigned ${res.assigned} review(s)`);
      setReviewerEmails("");
      setSelectedSubmissionIds([]);
      void queryClient.invalidateQueries({ queryKey: ["evaluation-plans"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not assign reviewers"),
  });

  const remind = useMutation({
    mutationFn: () => evaluationsApi.remind(planId!),
    onSuccess: ({ sent }) => toast.success(`Sent ${sent} reviewer reminder${sent === 1 ? "" : "s"}`),
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not send reminders"),
  });

  const runAiReview = useMutation({
    mutationFn: (submissionId: string) => evaluationsApi.runAiReview(planId!, submissionId, crypto.randomUUID()),
    onSuccess: (run) => {
      setAiSubmissionId(run.submission_id);
      toast.success("AI review completed");
      void queryClient.invalidateQueries({ queryKey: ["evaluation-plans", planId, "ai-reviews", run.submission_id] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "AI review failed"),
  });

  const overrideAi = useMutation({
    mutationFn: (runId: string) => evaluationsApi.overrideAiReview(planId!, runId, Number(overrideScore), overrideReason),
    onSuccess: () => {
      toast.success("Human override saved");
      setOverrideScore("");
      setOverrideReason("");
      void queryClient.invalidateQueries({ queryKey: ["evaluation-plans", planId, "ai-reviews", aiSubmissionId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save override"),
  });

  function updateCriterion(index: number, patch: Partial<CriterionConfig>) {
    const criteria = [...(draft.criteria ?? [])];
    criteria[index] = { ...criteria[index]!, ...patch };
    setDraft((d) => ({ ...d, criteria }));
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <button onClick={() => navigate(`/app/events/${eventId}/evaluations`)} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to evaluations
      </button>
      <h1 className="mb-6 text-xl font-semibold text-foreground">{isNew ? "New evaluation plan" : draft.name}</h1>

      <div className="space-y-6">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="AI Committee" />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Round</Label>
            <Input type="number" min={1} value={draft.round_number ?? 1} onChange={(e) => setDraft((d) => ({ ...d, round_number: Number(e.target.value) }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Opens</Label>
            <Input type="datetime-local" value={toLocalDateTime(draft.opens_at)} onChange={(e) => setDraft((d) => ({ ...d, opens_at: e.target.value ? new Date(e.target.value).toISOString() : null }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Closes</Label>
            <Input type="datetime-local" value={toLocalDateTime(draft.closes_at)} onChange={(e) => setDraft((d) => ({ ...d, closes_at: e.target.value ? new Date(e.target.value).toISOString() : null }))} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Instructions</Label>
          <Textarea rows={3} value={draft.instructions ?? ""} onChange={(e) => setDraft((d) => ({ ...d, instructions: e.target.value }))} />
        </div>

        <div className="space-y-2">
          <Label>Criteria</Label>
          {(draft.criteria ?? []).map((criterion, index) => (
            <div key={index} className="space-y-3 rounded-lg border border-border p-3">
              <div className="grid grid-cols-12 items-center gap-2">
              <Input className="col-span-5 h-8" value={criterion.label} placeholder="Label" onChange={(e) => updateCriterion(index, { label: e.target.value, key: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_") })} />
              <Select value={criterion.type} onValueChange={(v) => updateCriterion(index, { type: v })}>
                <SelectTrigger className="col-span-3 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRITERION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {criterion.type === "numeric" ? <Input className="col-span-2 h-8" type="number" min={2} max={10} value={criterion.scale_max ?? 5} placeholder="Scale" onChange={(e) => updateCriterion(index, { scale_max: Number(e.target.value) })} /> : <div className="col-span-2" />}
              <Input className="col-span-1 h-8 px-2" aria-label="Weight" type="number" value={criterion.weight ?? 1} placeholder="Wt" onChange={(e) => updateCriterion(index, { weight: Number(e.target.value) })} />
              <Button
                variant="ghost"
                size="icon"
                className="col-span-1"
                onClick={() => setDraft((d) => ({ ...d, criteria: (d.criteria ?? []).filter((_, i) => i !== index) }))}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
              </div>
              <Input value={criterion.description ?? ""} placeholder="Reviewer guidance (optional)" onChange={(e) => updateCriterion(index, { description: e.target.value })} />
              {criterion.type === "dropdown" && (
                <Input
                  value={(criterion.options ?? []).join(", ")}
                  placeholder="Dropdown options, comma separated"
                  onChange={(e) => updateCriterion(index, { options: e.target.value.split(",").map((option) => option.trim()).filter(Boolean) })}
                />
              )}
              <div className="flex items-center gap-2">
                <Switch checked={criterion.required ?? true} onCheckedChange={(required) => updateCriterion(index, { required })} />
                <span className="text-xs text-muted-foreground">Required before submitting</span>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDraft((d) => ({ ...d, criteria: [...(d.criteria ?? []), { key: `criterion_${Date.now()}`, label: "New criterion", type: "numeric", scale_max: 5, weight: 1 }] }))}
          >
            <Plus className="h-4 w-4" />
            Add criterion
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label>Reviews required per submission</Label>
          <Input type="number" value={draft.reviews_required ?? 2} onChange={(e) => setDraft((d) => ({ ...d, reviews_required: Number(e.target.value) }))} className="w-24" />
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div>
            <Label>Blind review</Label>
            <p className="text-xs text-muted-foreground">Hides speaker identity/company from reviewers.</p>
          </div>
          <Switch checked={Boolean(draft.blind_review)} onCheckedChange={(v) => setDraft((d) => ({ ...d, blind_review: v }))} />
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Save plan
        </Button>

        {!isNew && (
          <div className="space-y-6 border-t border-border pt-6">
            <div className="space-y-3">
              <div>
                <Label>Assign reviewers</Label>
                <p className="mt-1 text-xs text-muted-foreground">Choose an exact proposal subset, or leave all unchecked to use the plan scope.</p>
              </div>
              <Input value={reviewerEmails} onChange={(e) => setReviewerEmails(e.target.value)} placeholder="reviewer@example.com, another@example.com" />
              <div className="grid gap-3 sm:grid-cols-3">
                <Select value={assignmentStrategy} onValueChange={(value) => setAssignmentStrategy(value as "every" | "distribute")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="every">Every reviewer</SelectItem><SelectItem value="distribute">Distribute evenly</SelectItem></SelectContent>
                </Select>
                <Input type="number" min={1} value={reviewerCap} onChange={(e) => setReviewerCap(e.target.value)} placeholder="Max per reviewer" />
                <Input type="datetime-local" value={assignmentDueAt} onChange={(e) => setAssignmentDueAt(e.target.value)} />
              </div>
              <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {submissions.filter((submission) => ["submitted", "pending_review", "accept_queue", "decline_queue"].includes(submission.status)).map((submission) => (
                  <label key={submission.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-secondary/40">
                    <input
                      type="checkbox"
                      checked={selectedSubmissionIds.includes(submission.id)}
                      onChange={(event) => setSelectedSubmissionIds((current) => event.target.checked ? [...current, submission.id] : current.filter((id) => id !== submission.id))}
                      className="size-4 rounded border-border accent-primary"
                    />
                    <span className="min-w-0 flex-1 truncate">{submission.title || "Untitled"}</span>
                    <span className="text-xs text-muted-foreground">{submission.reference_code}</span>
                  </label>
                ))}
              </div>
              <Button onClick={() => assign.mutate()} disabled={assign.isPending || reviewerEmails.trim().length === 0}>
                Assign {selectedSubmissionIds.length ? `${selectedSubmissionIds.length} selected` : "in-scope proposals"}
              </Button>
            </div>

            <div className="space-y-3 border-t border-border pt-6">
              <div className="flex items-center justify-between gap-3">
                <div><Label>Reviewer progress</Label><p className="mt-1 text-xs text-muted-foreground">Completion for this round.</p></div>
                <Button variant="outline" size="sm" onClick={() => remind.mutate()} disabled={remind.isPending || progress.every((row) => row.outstanding === 0)}><Send className="size-4" />Send reminders</Button>
              </div>
              <div className="divide-y divide-border rounded-lg border border-border">
                {progress.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No reviewers assigned yet.</p> : progress.map((row) => (
                  <div key={row.person_id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{row.name || row.email}</p><p className="truncate text-xs text-muted-foreground">{row.email}</p></div>
                    <div className="text-right"><p className="text-sm font-medium tabular-nums">{row.completed}/{row.assigned}</p><p className="text-xs text-muted-foreground">{row.percent}% · {row.outstanding} outstanding{row.recused ? ` · ${row.recused} recused` : ""}</p></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 border-t border-border pt-6">
              <div className="flex items-center justify-between gap-3">
                <div><Label>Results</Label><p className="mt-1 text-xs text-muted-foreground">Aggregate scores include completed reviews in this round only.</p></div>
                <Button variant="outline" size="sm" asChild><a href={evaluationsApi.exportUrl(eventId)}><Download className="size-4" />Export CSV</a></Button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-secondary/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Submission</th><th className="px-3 py-2 font-medium">Progress</th><th className="px-3 py-2 font-medium"><button className="inline-flex items-center gap-1" onClick={() => setScoreDescending((value) => !value)}>Score<ArrowUpDown className="size-3" /></button></th><th className="px-3 py-2 font-medium">AI assist</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {[...results].sort((a, b) => (scoreDescending ? -1 : 1) * ((a.aggregate_score ?? -1) - (b.aggregate_score ?? -1))).map((row) => (
                      <tr key={row.submission_id}><td className="px-3 py-2.5"><p className="font-medium">{row.title || "Untitled"}</p><p className="text-xs text-muted-foreground">{row.reference_code} · {row.speakers.map((speaker) => `${speaker.name} (${speaker.role})`).join(", ")}</p></td><td className="px-3 py-2.5 tabular-nums">{row.completed}/{row.assigned}{row.recused ? ` · ${row.recused} recused` : ""}</td><td className="px-3 py-2.5 font-medium tabular-nums">{row.aggregate_score ?? "—"}</td><td className="px-3 py-2.5"><Button variant="ghost" size="sm" onClick={() => setAiSubmissionId(row.submission_id)}><Sparkles className="size-4" />Review</Button></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {aiSubmissionId && (
                <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/[0.035] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div><p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" />AI advisory review</p><p className="mt-1 text-xs text-muted-foreground">Stored separately from human scores. Organizers retain final judgment.</p></div>
                    <Button size="sm" onClick={() => runAiReview.mutate(aiSubmissionId)} disabled={runAiReview.isPending}>{aiRuns.length ? "Re-run AI review" : "Run AI review"}</Button>
                  </div>
                  {aiRuns.length === 0 ? <p className="text-sm text-muted-foreground">No model review has been run for this proposal.</p> : (() => {
                    const run = aiRuns[0]!;
                    return <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><span className="rounded-full bg-background px-2.5 py-1 font-medium text-foreground">{run.status}</span><span>{run.model}</span><span>{new Date(run.created_at).toLocaleString()}</span>{run.input_tokens != null && <span>{run.input_tokens + (run.output_tokens ?? 0)} tokens</span>}</div>
                      {run.status === "failed" ? <p className="text-sm text-destructive">{run.error || "The model review failed."}</p> : <><p className="text-sm leading-relaxed">{run.rationale}</p><div className="grid gap-2 sm:grid-cols-2">{run.criteria.map((criterion) => <div key={criterion.key} className="rounded-lg border border-border bg-background p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{criterion.key} · {criterion.score ?? "text"}</p><p className="mt-1 text-sm">{criterion.rationale}</p></div>)}</div>{run.override_score != null && <div className="rounded-lg border border-warning/30 bg-warning/10 p-3"><p className="text-xs font-semibold uppercase tracking-wide">Human override · {run.override_score}</p><p className="mt-1 text-sm">{run.override_reason}</p></div>}<div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]"><Input type="number" min={0} max={10} step="0.1" value={overrideScore} onChange={(e) => setOverrideScore(e.target.value)} placeholder="Score" /><Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Why are you overriding this suggestion?" /><Button variant="outline" onClick={() => overrideAi.mutate(run.id)} disabled={!overrideScore || !overrideReason.trim() || overrideAi.isPending}>Save override</Button></div></>}
                    </div>;
                  })()}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
