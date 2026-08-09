import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { requestCodeSchema, verifyCodeSchema } from "@opensession/schemas";
import type { ParticipantInput, Submission, SubmissionWriteInput } from "@opensession/schemas";
import { Button, Input, Label, cn } from "@opensession/ui";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileClock,
  Hash,
  Lock,
  Mail,
  PartyPopper,
  Save,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { publicApi, meApi, ApiError } from "../../api";
import { useAuth } from "../../lib/auth";
import { StepProgress } from "../../layouts/public-shell";
import { AmbientBackdrop, EventMark, EventMeta } from "../../components/event-identity";
import { missingRequiredFields } from "../../lib/conditional-rules";
import { sanitizeHtml } from "../../lib/sanitize-html";
import { DynamicForm } from "./DynamicForm";
import { ParticipantListEditor } from "../../components/participant-list-editor";

type Stage = "welcome" | "account" | "submission" | "participants" | "review" | "success";
const STEP_LABELS = ["Welcome", "Account", "Submission", "Participants", "Review"];

export function PublicCfpPage() {
  const { eventSlug, formSlug } = useParams<{ eventSlug: string; formSlug: string }>();
  const { user, refetch } = useAuth();
  const [stage, setStage] = useState<Stage>("welcome");
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [participants, setParticipants] = useState<ParticipantInput[]>([]);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const { data: form, isLoading } = useQuery({
    queryKey: ["public-form", eventSlug, formSlug],
    queryFn: () => publicApi.getForm(eventSlug!, formSlug!),
    enabled: Boolean(eventSlug && formSlug),
  });
  // The form payload carries only the event's name/description; dates and
  // location come from the public event summary, which the portal also uses.
  const { data: event } = useQuery({
    queryKey: ["public-event", eventSlug],
    queryFn: () => publicApi.getEvent(eventSlug!),
    enabled: Boolean(eventSlug),
  });

  // Prefill the signed-in speaker as presenter #1 — the server does the same on
  // an empty list, and seeing themselves already listed is what stops a solo
  // speaker wondering why the form is asking for a speaker.
  useEffect(() => {
    if (!user?.email || participants.length > 0) return;
    const role = form?.participant_roles?.[0]?.role;
    if (!role) return;
    setParticipants([{ email: user.email, role }]);
  }, [user?.email, form?.participant_roles, participants.length]);

  // Any draft this speaker already started on this form. Fetched once they are
  // signed in, so returning to the CFP can offer to pick up where they left off
  // instead of silently starting over.
  const { data: myDrafts = [] } = useQuery({
    queryKey: ["me", "submissions"],
    queryFn: meApi.submissions,
    enabled: Boolean(user),
  });
  const resumableDraft = useMemo(
    () => myDrafts.find((s) => s.form_id === form?.id && s.status === "draft") ?? null,
    [myDrafts, form?.id],
  );
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const emailForm = useForm<z.infer<typeof requestCodeSchema>>({ resolver: zodResolver(requestCodeSchema) });
  const codeForm = useForm<z.infer<typeof verifyCodeSchema>>({ resolver: zodResolver(verifyCodeSchema) });

  function buildPayload(): SubmissionWriteInput {
    const customAnswers: Record<string, unknown> = {};
    let title: string | undefined;
    let description: string | undefined;
    let formatId: string | undefined;
    let trackIds: string[] = [];
    let level: string | undefined;
    for (const section of form?.sections ?? []) {
      for (const field of section.fields ?? []) {
        const value = answers[field.key];
        if (field.system_field === "title") title = String(value ?? "");
        else if (field.system_field === "description") description = String(value ?? "");
        else if (field.system_field === "format") formatId = String(value ?? "") || undefined;
        else if (field.system_field === "track") trackIds = Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [];
        else if (field.system_field === "level") level = String(value ?? "") || undefined;
        else customAnswers[field.key] = value;
      }
    }
    return {
      title,
      description,
      format_id: formatId,
      track_ids: trackIds,
      level,
      custom_answers: customAnswers,
      participants,
    };
  }

  /**
   * Rebuild the wizard's answer map from a stored draft.
   *
   * The inverse of `buildPayload`: system fields live on real columns while
   * everything else sits in `custom_answers`, so resuming has to route each one
   * back to its field key.
   */
  function hydrateAnswers(submission: Submission): Record<string, unknown> {
    const next: Record<string, unknown> = { ...(submission.custom_answers ?? {}) };
    for (const section of form?.sections ?? []) {
      for (const field of section.fields ?? []) {
        if (field.system_field === "title") next[field.key] = submission.title ?? "";
        else if (field.system_field === "description") next[field.key] = submission.description ?? "";
        else if (field.system_field === "format") next[field.key] = submission.format_id ?? "";
        else if (field.system_field === "level") next[field.key] = submission.level ?? "";
        else if (field.system_field === "track") {
          next[field.key] = submission.track_ids?.length
            ? submission.track_ids
            : submission.track_id
              ? [submission.track_id]
              : [];
        }
      }
    }
    return next;
  }

  const requestCode = useMutation({
    mutationFn: (values: z.infer<typeof requestCodeSchema>) => publicApi.requestCode(eventSlug!, formSlug!, values.email),
    onSuccess: (res, values) => {
      setEmail(values.email);
      setDevCode(res.dev_code ?? null);
      codeForm.setValue("email", values.email);
      toast.success(res.dev_code ? "Dev mode: code shown below" : "Check your email for a code");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not send code"),
  });

  const verify = useMutation({
    mutationFn: (values: z.infer<typeof verifyCodeSchema>) =>
      publicApi.verify(eventSlug!, formSlug!, values.email, values.code, {
        first_name: values.first_name,
        last_name: values.last_name,
      }),
    onSuccess: async () => {
      await refetch();
      setStage("submission");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Invalid code"),
  });

  const createDraft = useMutation({
    mutationFn: () => publicApi.createSubmission(eventSlug!, formSlug!, buildPayload()),
    onSuccess: (submission) => {
      setSubmissionId(submission.id);
      setStage((form?.participant_roles?.length ?? 0) > 0 ? "participants" : "review");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save"),
  });

  const updateDraft = useMutation({
    mutationFn: () => publicApi.updateSubmission(submissionId!, buildPayload()),
    onSuccess: () => setStage("review"),
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save"),
  });

  // The API validates required/typed answers on submit and returns them as a
  // list of readable messages. They are held in state rather than only toasted:
  // the offending fields live two steps back, so a notification that fades after
  // a few seconds leaves the speaker stuck on a screen that just says "Submit".
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  // Per-field errors for the current step, so a blank required field is caught
  // where it lives rather than at the end of the wizard.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submitted = useMutation({
    mutationFn: () => publicApi.submit(submissionId!, buildPayload()),
    onSuccess: () => {
      setSubmitErrors([]);
      setStage("success");
    },
    onError: (error) => {
      if (error instanceof ApiError && Array.isArray(error.detail)) {
        setSubmitErrors(error.detail.map((d) => (typeof d === "string" ? d : JSON.stringify(d))));
        return;
      }
      setSubmitErrors([]);
      toast.error(error instanceof ApiError ? error.message2 : "Could not submit");
    },
  });

  const saveDraft = useMutation({
    mutationFn: async () => {
      if (submissionId) return publicApi.updateSubmission(submissionId, buildPayload());
      const created = await publicApi.createSubmission(eventSlug!, formSlug!, buildPayload());
      setSubmissionId(created.id);
      return created;
    },
    onSuccess: () => {
      setSavedAt(new Date());
      toast.success("Draft saved — you can finish this later");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save your draft"),
  });

  function resumeDraft(draft: Submission) {
    setSubmissionId(draft.id);
    setAnswers(hydrateAnswers(draft));
    setSavedAt(draft.updated_at ? new Date(draft.updated_at) : new Date());
    setStage("submission");
  }

  const activeIndex = useMemo(() => {
    const order: Stage[] = ["welcome", "account", "submission", "participants", "review"];
    return Math.max(0, order.indexOf(stage));
  }, [stage]);

  // Participant-count errors belong to the Participants step, everything else to
  // the form. Sending a speaker to the wrong step to fix a named problem is worse
  // than not offering the shortcut at all.
  const errorStage: Stage = useMemo(
    () => (submitErrors.some((e) => /participant/i.test(e)) && submitErrors.every((e) => /participant/i.test(e))
      ? "participants"
      : "submission"),
    [submitErrors],
  );

  const title = useMemo(() => {
    for (const section of form?.sections ?? []) {
      for (const field of section.fields ?? []) {
        if (field.system_field === "title") return String(answers[field.key] ?? "");
      }
    }
    return "";
  }, [form, answers]);

  if (isLoading) {
    return (
      <CenteredNotice>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </CenteredNotice>
    );
  }

  if (!form) {
    return (
      <CenteredNotice>
        <EventMark className="mx-auto" />
        <h1 className="mt-4 text-lg font-semibold text-foreground">This call for speakers isn&apos;t available</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The link may be mistyped, or the form may have been removed.
        </p>
      </CenteredNotice>
    );
  }

  if (form.status !== "open" || form.accepting_submissions === false) {
    return (
      <CenteredNotice>
        <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-warning/12 text-warning">
          <Lock className="size-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-foreground">Submissions are closed</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {form.closed_reason ?? `${form.public_title} is not accepting submissions right now.`} Check back with the organizers of {form.event.name}.
        </p>
      </CenteredNotice>
    );
  }

  // Always in the *event's* timezone with the zone spelled out — a speaker in
  // another country must not have to guess whose midnight the deadline is.
  // Spelled out as individual components on purpose: `timeZoneName` cannot be
  // combined with the `dateStyle`/`timeStyle` shorthands, which throws at runtime.
  const deadline = form.close_at
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
        timeZone: event?.timezone || "UTC",
      }).format(new Date(form.close_at))
    : null;

  // The success screen is a destination, not another step — it drops the rail
  // and the sidebar so nothing invites the speaker back into the form.
  if (stage === "success") {
    return (
      <div className="relative flex min-h-screen items-center justify-center px-4 py-16">
        <AmbientBackdrop />
        <div className="relative w-full max-w-lg text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-success/12 text-success">
            <PartyPopper className="size-7" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">Submission received</h1>
          {form.success_message_html ? (
            <div
              className="prose prose-sm mx-auto mt-3 dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.success_message_html) }}
            />
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Thanks for submitting to {form.event.name}. You&apos;ll hear from the organizers by email — you can track
              its status any time from your speaker portal.
            </p>
          )}
          <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
            <Button asChild>
              <a href={`/portal/${eventSlug}`}>
                Go to speaker portal
                <ArrowRight />
              </a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // The welcome step is the event's landing page: a full hero, not a step in a
  // wizard, so it gets the whole width before the two-column form frame starts.
  if (stage === "welcome") {
    return (
      <div className="relative min-h-screen">
        <AmbientBackdrop />
        <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-5 py-16">
          <EventMark className="size-11" />
          <p className="mt-6 text-sm font-medium text-primary">{form.event.name}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-[2.5rem] sm:leading-[1.1]">
            {form.public_title}
          </h1>
          {form.event.description && (
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">{form.event.description}</p>
          )}

          {event && <EventMeta event={event} className="mt-6 sm:flex-row sm:gap-6" />}

          {(deadline || form.submission_limit) && (
            <div className="mt-8 flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4 sm:flex-row sm:items-center sm:gap-6">
              {deadline && (
                <div className="flex items-start gap-2.5">
                  <CalendarClock className="mt-0.5 size-4 shrink-0 text-warning" />
                  <p className="text-sm font-medium text-foreground">Submissions close {deadline}</p>
                </div>
              )}
              {form.submission_limit && (
                <div className="flex items-start gap-2.5">
                  <Hash className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Up to <span className="font-medium text-foreground">{form.submission_limit}</span> submission
                    {form.submission_limit === 1 ? "" : "s"} per person
                  </p>
                </div>
              )}
            </div>
          )}

          {resumableDraft && (
            <div className="mt-8 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/[0.07] p-4 sm:flex-row sm:items-center">
              <FileClock className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">You have a draft in progress</p>
                <p className="truncate text-sm text-muted-foreground">
                  {resumableDraft.title || "Untitled submission"}
                </p>
              </div>
              <Button size="sm" onClick={() => resumeDraft(resumableDraft)}>
                Resume draft
                <ArrowRight />
              </Button>
            </div>
          )}

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Button size="lg" onClick={() => setStage(user ? "submission" : "account")}>
              {resumableDraft ? "Start a new submission" : "Start your submission"}
              <ArrowRight />
            </Button>
            <p className="text-xs text-muted-foreground">
              {user ? `Signed in as ${user.email}` : "Takes a few minutes · no password needed"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <AmbientBackdrop className="h-[26rem]" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-14 lg:py-16">
        {/* Identity rail — keeps the speaker anchored to *which* conference they
            are submitting to across every step. Static on mobile, sticky on
            desktop where there's room beside the form. */}
        <aside className="lg:sticky lg:top-16 lg:self-start">
          <div className="flex items-start gap-3">
            <EventMark />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{form.event.name}</p>
              <p className="text-xs text-muted-foreground">{form.public_title}</p>
            </div>
          </div>
          {event && <EventMeta event={event} className="mt-5 hidden lg:flex" />}
          {deadline && (
            <p className="mt-5 hidden items-start gap-2 text-xs text-muted-foreground lg:flex">
              <CalendarClock className="mt-px size-3.5 shrink-0 text-warning" />
              Closes {deadline}
            </p>
          )}
          <div className="mt-6 hidden h-px bg-border lg:block" />
          <p className="mt-6 hidden text-xs leading-relaxed text-muted-foreground lg:block">
            Use “Save as draft” at any point and this page will offer to pick it back up next time — you can also
            finish from your speaker portal.
          </p>
        </aside>

        <main className="min-w-0">
          <StepProgress steps={STEP_LABELS} activeIndex={activeIndex} />

          {stage === "account" && (
            <StageCard
              icon={Mail}
              title="Verify your email"
              description={
                devCode
                  ? `We sent a 6-digit code to ${email}.`
                  : "We'll email you a one-time code. No password to create or remember."
              }
            >
              {!devCode ? (
                <form onSubmit={emailForm.handleSubmit((v) => requestCode.mutate(v))} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cfp-email">Email address</Label>
                    <Input id="cfp-email" type="email" autoComplete="email" placeholder="you@example.com" {...emailForm.register("email")} />
                    {emailForm.formState.errors.email && (
                      <p className="text-xs text-destructive">{emailForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  <Button type="submit" className="w-full" disabled={requestCode.isPending}>
                    {requestCode.isPending ? "Sending…" : "Send sign-in code"}
                  </Button>
                  <Button variant="outline" className="w-full" asChild>
                    <Link to={`/login?next=${encodeURIComponent(`/submit/${eventSlug}/${formSlug}`)}`}>
                      Sign in from the account page
                    </Link>
                  </Button>
                </form>
              ) : (
                <form onSubmit={codeForm.handleSubmit((v) => verify.mutate(v))} className="space-y-4">
                  <p className="rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
                    Development mode — your code is <span className="font-mono font-semibold">{devCode}</span>
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="cfp-first">First name</Label>
                      <Input id="cfp-first" autoComplete="given-name" placeholder="Priya" {...codeForm.register("first_name")} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cfp-last">Last name</Label>
                      <Input id="cfp-last" autoComplete="family-name" placeholder="Raman" {...codeForm.register("last_name")} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Used on the program if this is your first submission. Returning speakers keep the name already on
                    their profile.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="cfp-code">Sign-in code</Label>
                    <Input
                      id="cfp-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      className="h-11 text-center text-lg tracking-[0.4em]"
                      {...codeForm.register("code")}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={verify.isPending}>
                    {verify.isPending ? "Verifying…" : "Verify & continue"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setDevCode(null)}
                    className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    Use a different email
                  </button>
                </form>
              )}
            </StageCard>
          )}

          {stage === "submission" && (
            <div className="space-y-8">
              {Object.keys(fieldErrors).length > 0 && (
                <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3 py-2 text-sm text-destructive">
                  {Object.keys(fieldErrors).length} required field
                  {Object.keys(fieldErrors).length === 1 ? "" : "s"} still needed — see below.
                </p>
              )}
              <DynamicForm
                sections={form.sections}
                rules={form.conditional_rules ?? []}
                answers={answers}
                onChange={(key, value) => {
                  setAnswers((a) => ({ ...a, [key]: value }));
                  // Clear a field's error the moment it is filled in, so the page
                  // does not keep scolding about something already fixed.
                  setFieldErrors((prev) => {
                    if (!prev[key]) return prev;
                    const { [key]: _cleared, ...rest } = prev;
                    return rest;
                  });
                }}
                options={{ tracks: form.tracks, formats: form.formats, tags: form.tags }}
                errors={fieldErrors}
              />
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/50 px-3 py-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => saveDraft.mutate()}
                  disabled={saveDraft.isPending}
                >
                  <Save />
                  {saveDraft.isPending ? "Saving…" : "Save as draft"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {savedAt
                    ? `Draft saved at ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} — you can close this tab and finish later.`
                    : "Save now and finish later from this page or your speaker portal."}
                </p>
              </div>

              <StageFooter
                onBack={() => setStage(user ? "welcome" : "account")}
                next={{
                  label: "Continue",
                  onClick: () => {
                    const missing = missingRequiredFields(form.sections, form.conditional_rules ?? [], answers);
                    setFieldErrors(missing);
                    if (Object.keys(missing).length > 0) {
                      const first = Object.keys(missing)[0];
                      document.getElementById(`field-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                      return;
                    }
                    return submissionId ? updateDraft.mutate() : createDraft.mutate();
                  },
                  pending: createDraft.isPending || updateDraft.isPending,
                }}
              />
            </div>
          )}

          {stage === "participants" && (
            <div className="space-y-8">
              <StageHeading
                icon={Users}
                title="Who's presenting?"
                description="Add everyone who should appear on the program and receive speaker emails."
              />
              <ParticipantListEditor
                value={participants}
                onChange={setParticipants}
                roles={(form.participant_roles ?? []).map((r) => r.role)}
              />
              <StageFooter
                onBack={() => setStage("submission")}
                next={{ label: "Continue", onClick: () => updateDraft.mutate(), pending: updateDraft.isPending }}
              />
            </div>
          )}

          {stage === "review" && (
            <div className="space-y-8">
              <StageHeading
                icon={CheckCircle2}
                title="Review and submit"
                description="Check the details below. You can still edit your submission after sending it, until the organizers close editing."
              />
              {submitErrors.length > 0 && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/[0.07] p-4">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {submitErrors.length} thing{submitErrors.length === 1 ? "" : "s"} still needed
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                        {submitErrors.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => setStage(errorStage)}>
                        <ArrowLeft />
                        {errorStage === "participants" ? "Back to presenters" : "Back to the form"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                <ReviewRow label="Submitting to" value={form.event.name} />
                <ReviewRow label="Title" value={title || "—"} />
                <ReviewRow
                  label="Presenters"
                  value={
                    participants.length === 0
                      ? "Just you"
                      : participants.map((p) => p.first_name ? `${p.first_name} ${p.last_name ?? ""}`.trim() : p.email).join(", ")
                  }
                />
                <ReviewRow label="Submitted as" value={user?.email ?? email} />
              </dl>
              <StageFooter
                onBack={() => setStage((form.participant_roles?.length ?? 0) > 0 ? "participants" : "submission")}
                next={{
                  label: "Submit",
                  onClick: () => submitted.mutate(),
                  pending: submitted.isPending,
                  pendingLabel: "Submitting…",
                }}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function CenteredNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-16">
      <AmbientBackdrop />
      <div className="relative w-full max-w-md text-center">{children}</div>
    </div>
  );
}

function StageHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
        <Icon className="size-[18px]" />
      </span>
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

/** Narrow measure for the auth step — a lone email field should not stretch to
 *  the full form width, which is sized for rich-text and multi-column answers. */
function StageCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-md">
      <StageHeading icon={icon} title={title} description={description} />
      <div className="mt-6">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 px-4 py-3 text-sm">
      <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-foreground">{value}</dd>
    </div>
  );
}

function StageFooter({
  onBack,
  next,
}: {
  onBack?: () => void;
  next: { label: string; onClick: () => void; pending?: boolean; pendingLabel?: string };
}) {
  return (
    <div className={cn("flex items-center gap-3 border-t border-border pt-6", onBack ? "justify-between" : "justify-end")}>
      {onBack && (
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft />
          Back
        </Button>
      )}
      <Button onClick={next.onClick} disabled={next.pending}>
        {next.pending ? (next.pendingLabel ?? "Saving…") : next.label}
        {!next.pending && <ArrowRight />}
      </Button>
    </div>
  );
}
