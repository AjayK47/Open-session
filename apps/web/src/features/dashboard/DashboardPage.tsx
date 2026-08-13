import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { differenceInCalendarDays, format } from "date-fns";
import { ArrowRight, CalendarDays, FileText, ListChecks, Users } from "lucide-react";
import { cn } from "@opensession/ui";
import { dashboardApi, submissionsApi, speakersApi, evaluationsApi, programApi, sessionsApi, formsApi, meApi } from "../../api";
import { useAuth } from "../../lib/auth";
import { useCurrentEvent } from "../../lib/current-event";
import { StatTile } from "../../components/stat-tile";
import { LineChart } from "../../components/charts/LineChart";
import { DonutChart } from "../../components/charts/DonutChart";
import { BarChart } from "../../components/charts/BarChart";
import { StatusPill, SUBMISSION_STATUS_TONE } from "../../components/status-pill";
import { TrackPill, trackColorVar } from "../../components/track-tag-picker";
import { OnboardingBlock } from "./OnboardingBlock";

type DashTab = "today" | "review" | "speakers" | "pipeline" | "forms" | "participants" | "evals" | "agenda_tab";
const TABS: { key: DashTab; label: string; dot: string }[] = [
  { key: "today", label: "Today", dot: "var(--primary)" },
  { key: "review", label: "Review Progress", dot: "var(--warning)" },
  { key: "speakers", label: "Speaker Tracking", dot: "var(--primary)" },
  { key: "pipeline", label: "Submissions Pipeline", dot: "hsl(268 60% 55%)" },
  { key: "forms", label: "Submission Forms", dot: "var(--primary)" },
  { key: "participants", label: "Participants", dot: "var(--success)" },
  { key: "evals", label: "Evaluations", dot: "var(--warning)" },
  { key: "agenda_tab", label: "Agenda", dot: "var(--track-6)" },
];

export function DashboardPage() {
  const { event, eventId } = useCurrentEvent();
  const { user } = useAuth();
  const [tab, setTab] = useState<DashTab>("today");

  const { data: metrics } = useQuery({ queryKey: ["metrics", eventId], queryFn: () => dashboardApi.metrics(eventId), enabled: Boolean(eventId) });
  const { data: submissions = [] } = useQuery({ queryKey: ["submissions", eventId], queryFn: () => submissionsApi.list(eventId), enabled: Boolean(eventId) });
  const { data: tracks = [] } = useQuery({ queryKey: ["tracks", eventId], queryFn: () => programApi.tracks.list(eventId), enabled: Boolean(eventId) });
  const { data: forms = [] } = useQuery({ queryKey: ["forms", eventId], queryFn: () => formsApi.list(eventId), enabled: Boolean(eventId) });
  const { data: profile } = useQuery({ queryKey: ["me", "profile"], queryFn: meApi.profile, enabled: Boolean(user) });

  const daysToEvent = event?.starts_at ? differenceInCalendarDays(new Date(event.starts_at), new Date()) : null;
  // Prefer the organizer's actual name (set on their Person profile) — the
  // email's local part is a fallback for accounts that never filled it in,
  // not the default a signed-in person should see every morning.
  const greetingName = profile?.first_name
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ")
    : (user?.email?.split("@")[0] ?? "");

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { accepted: 0, pending_review: 0, declined: 0, draft: 0, withdrawn: 0 };
    for (const s of submissions) {
      if (s.status === "submitted") counts.pending_review = (counts.pending_review ?? 0) + 1;
      else if (s.status in counts) counts[s.status] = (counts[s.status] ?? 0) + 1;
    }
    return counts;
  }, [submissions]);

  const actionItems = [
    metrics && metrics.unscheduled_sessions > 0
      ? { text: `${metrics.unscheduled_sessions} accepted session${metrics.unscheduled_sessions === 1 ? "" : "s"} still need a time slot on the agenda.`, href: `/app/events/${eventId}/agenda`, label: "Agenda" }
      : null,
    metrics && metrics.pending_review > 0
      ? { text: `${metrics.pending_review} session submission${metrics.pending_review === 1 ? "" : "s"} are awaiting a decision.`, href: `/app/events/${eventId}/submissions`, label: "Participants" }
      : null,
    metrics && metrics.overdue_tasks > 0
      ? { text: `${metrics.overdue_tasks} speaker task${metrics.overdue_tasks === 1 ? "" : "s"} overdue.`, href: `/app/events/${eventId}/tasks`, label: "Tasks" }
      : null,
  ].filter((x): x is { text: string; href: string; label: string } => Boolean(x));

  return (
    <div className="space-y-6 px-6 py-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {format(new Date(), "EEEE, MMMM d")}
          {daysToEvent !== null ? ` · ${daysToEvent >= 0 ? `${daysToEvent} days to event` : "Event underway or past"}` : ""}
        </p>
        <h1 className="text-2xl font-bold text-foreground">Good morning{greetingName ? `, ${greetingName}` : ""}</h1>
      </div>

      <div className="flex items-center gap-5 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 pb-2.5 text-sm font-medium transition-colors",
              tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.dot }} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "today" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Submissions" value={metrics?.total_submissions ?? "–"} icon={FileText} tone="brand" href={`/app/events/${eventId}/submissions`} />
            <StatTile label="Accepted Speakers" value={metrics?.accepted_speakers ?? "–"} icon={Users} tone="success" href={`/app/events/${eventId}/speakers`} />
            <StatTile label="Scheduled Sessions" value={metrics?.scheduled_sessions ?? "–"} icon={CalendarDays} href={`/app/events/${eventId}/agenda`} />
            <StatTile label="Outstanding Tasks" value={metrics?.outstanding_tasks ?? "–"} icon={ListChecks} tone={metrics && metrics.overdue_tasks > 0 ? "warning" : "default"} href={`/app/events/${eventId}/tasks`} />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Submission Status</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatTile label="Accepted" value={statusCounts.accepted ?? 0} tone="success" />
              <StatTile label="Pending" value={statusCounts.pending_review ?? 0} tone="warning" />
              <StatTile label="Declined" value={statusCounts.declined ?? 0} />
              <StatTile label="Drafts" value={statusCounts.draft ?? 0} />
              <StatTile label="Withdrawn" value={statusCounts.withdrawn ?? 0} />
            </div>
          </div>

          {actionItems.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
              <span className="font-medium text-muted-foreground">Also check:</span>
              {actionItems.map((item, i) => (
                <Link key={i} to={item.href} className="inline-flex items-center gap-1 text-foreground hover:text-primary">
                  {item.text} <span className="text-muted-foreground">({item.label})</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ))}
            </div>
          )}

          <section className="rounded-lg border border-border bg-card p-5">
            <p className="mb-1 text-sm font-semibold text-foreground">Submission Pacing</p>
            <p className="mb-4 text-xs text-muted-foreground">Cumulative submissions in the run-up to event start.</p>
            <LineChart data={submissionPacing(submissions)} />
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Your forms</p>
              <Link to={`/app/events/${eventId}/forms`} className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {forms.slice(0, 3).map((f) => {
                const count = submissions.filter((s) => s.form_id === f.id).length;
                return (
                  <Link key={f.id} to={`/app/events/${eventId}/forms/${f.id}/edit`} className="rounded-lg border border-border bg-card p-4 hover:border-primary/40">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">{f.internal_name}</p>
                      <StatusPill label={f.status} tone={f.status === "open" ? "positive" : "neutral"} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{count} submitted</p>
                  </Link>
                );
              })}
              {forms.length === 0 && <p className="text-sm text-muted-foreground">No forms yet.</p>}
            </div>
          </section>

          <section>
            <p className="mb-2 text-sm font-semibold text-foreground">Recent Submissions</p>
            <div className="divide-y divide-border rounded-lg border border-border">
              {submissions.slice(0, 5).map((s) => (
                <Link key={s.id} to={`/app/events/${eventId}/submissions/${s.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-secondary/50">
                  <span className="font-medium text-foreground">{s.title || "Untitled"}</span>
                  <div className="flex items-center gap-3">
                    <StatusPill label={s.status} tone={SUBMISSION_STATUS_TONE[s.status] ?? "neutral"} />
                    <span className="w-24 text-right text-xs text-muted-foreground">{s.submitted_at ? format(new Date(s.submitted_at), "MMM d") : "—"}</span>
                  </div>
                </Link>
              ))}
              {submissions.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">No submissions yet.</p>}
            </div>
          </section>
        </div>
      )}

      {tab === "review" && <ReviewProgressTab eventId={eventId} />}
      {tab === "speakers" && <OnboardingBlock eventId={eventId} />}
      {tab === "pipeline" && <SubmissionsPipelineTab submissions={submissions} tracks={tracks} metrics={metrics} />}
      {tab === "forms" && <FormsTab eventId={eventId} />}
      {tab === "participants" && <ParticipantsTab eventId={eventId} />}
      {tab === "evals" && <EvaluationsTab eventId={eventId} />}
      {tab === "agenda_tab" && <AgendaTab eventId={eventId} />}
    </div>
  );
}

function submissionPacing(submissions: { submitted_at: string | null }[]) {
  const dated = submissions.filter((s) => s.submitted_at).map((s) => new Date(s.submitted_at!));
  if (dated.length === 0) return [{ label: "—", value: 0 }];
  dated.sort((a, b) => a.getTime() - b.getTime());
  const byDay = new Map<string, number>();
  let running = 0;
  for (const d of dated) {
    const key = format(d, "MMM d");
    running += 1;
    byDay.set(key, running);
  }
  return Array.from(byDay.entries()).map(([label, value]) => ({ label, value }));
}

function ReviewProgressTab({ eventId }: { eventId: string }) {
  const { data: plans = [] } = useQuery({ queryKey: ["evaluation-plans", eventId], queryFn: () => evaluationsApi.list(eventId) });
  const totalAssigned = plans.reduce((sum, p) => sum + p.assigned_submissions, 0);
  const totalCompleted = plans.reduce((sum, p) => sum + p.completed_reviews, 0);
  const totalInProgress = plans.reduce((sum, p) => sum + p.in_progress_reviews, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Assigned reviews" value={totalAssigned} />
        <StatTile label="Completed" value={totalCompleted} />
        <StatTile label="In progress" value={totalInProgress} tone={totalInProgress > 0 ? "warning" : "default"} />
      </div>
      <section className="rounded-lg border border-border bg-card p-5">
        <p className="mb-3 text-sm font-semibold text-foreground">Plans</p>
        {plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evaluation plans yet.</p>
        ) : (
          <BarChart data={plans.map((p) => ({ label: p.name, value: p.completed_reviews }))} />
        )}
      </section>
    </div>
  );
}

function SubmissionsPipelineTab({
  submissions,
  tracks,
  metrics,
}: {
  submissions: { status: string; track_id: string | null }[];
  tracks: { id: string; name: string }[];
  metrics?: { total_submissions: number; pending_review: number };
}) {
  const byTrack = tracks.map((t) => ({
    label: t.name,
    value: submissions.filter((s) => s.track_id === t.id).length,
    color: trackColorVar(t.id),
  }));
  const untracked = submissions.filter((s) => !s.track_id).length;
  if (untracked > 0) byTrack.push({ label: "No track", value: untracked, color: "var(--muted-foreground)" });

  const statusSlices = [
    { label: "Accepted", value: submissions.filter((s) => s.status === "accepted").length, color: "var(--success)" },
    { label: "Pending", value: submissions.filter((s) => s.status === "submitted" || s.status === "pending_review").length, color: "var(--warning)" },
    { label: "Declined", value: submissions.filter((s) => s.status === "declined").length, color: "var(--destructive)" },
    { label: "Other", value: submissions.filter((s) => ["draft", "withdrawn", "accept_queue", "decline_queue"].includes(s.status)).length, color: "var(--muted-foreground)" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Total submissions" value={metrics?.total_submissions ?? submissions.length} />
        <StatTile label="Pending review" value={metrics?.pending_review ?? 0} tone="warning" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-5">
          <p className="mb-3 text-sm font-semibold text-foreground">Submissions by track</p>
          {byTrack.length === 0 ? <p className="text-sm text-muted-foreground">No tracks configured.</p> : <BarChart data={byTrack} />}
        </section>
        <section className="rounded-lg border border-border bg-card p-5">
          <p className="mb-3 text-sm font-semibold text-foreground">Submission status mix</p>
          <DonutChart slices={statusSlices} centerLabel={`${submissions.length} total`} />
        </section>
      </div>
    </div>
  );
}

function FormsTab({ eventId }: { eventId: string }) {
  const { data: forms = [] } = useQuery({ queryKey: ["forms", eventId], queryFn: () => formsApi.list(eventId) });
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {forms.map((f) => (
          <Link key={f.id} to={`/app/events/${eventId}/forms/${f.id}/edit`} className="rounded-lg border border-border bg-card p-4 hover:border-primary/40">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{f.internal_name}</p>
              <StatusPill label={f.status} tone={f.status === "open" ? "positive" : "neutral"} />
            </div>
          </Link>
        ))}
        {forms.length === 0 && <p className="text-sm text-muted-foreground">No forms available.</p>}
      </div>
    </div>
  );
}

function ParticipantsTab({ eventId }: { eventId: string }) {
  const { data: speakers = [] } = useQuery({ queryKey: ["speakers", eventId], queryFn: () => speakersApi.list(eventId) });
  return (
    <div className="space-y-6">
      <StatTile label="Total Participants" value={speakers.length} />
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {speakers.slice(0, 10).map((s) => (
          <div key={s.person_id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="font-medium text-foreground">{s.first_name} {s.last_name}</span>
            <StatusPill label={s.confirmation_status || "pending"} tone={s.confirmation_status === "confirmed" ? "positive" : "neutral"} />
          </div>
        ))}
        {speakers.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">No participants yet.</p>}
      </div>
    </div>
  );
}

function EvaluationsTab({ eventId }: { eventId: string }) {
  const { data: plans = [] } = useQuery({ queryKey: ["evaluation-plans", eventId], queryFn: () => evaluationsApi.list(eventId) });
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((p) => (
          <div key={p.id} className="rounded-lg border border-border bg-card p-4">
            <p className="mb-2 text-sm font-medium text-foreground">{p.name}</p>
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>{p.completed_reviews} / {p.assigned_submissions} completed</span>
              <span>{p.assigned_submissions ? Math.round((p.completed_reviews / p.assigned_submissions) * 100) : 0}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${p.assigned_submissions ? Math.round((p.completed_reviews / p.assigned_submissions) * 100) : 0}%` }}
              />
            </div>
          </div>
        ))}
        {plans.length === 0 && <p className="text-sm text-muted-foreground">No evaluation plans found.</p>}
      </div>
    </div>
  );
}

function AgendaTab({ eventId }: { eventId: string }) {
  const { data: sessions = [] } = useQuery({ queryKey: ["sessions", eventId], queryFn: () => sessionsApi.list(eventId) });
  const scheduled = sessions.filter(s => s.starts_at).length;
  const unscheduled = sessions.length - scheduled;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Scheduled" value={scheduled} tone="success" />
        <StatTile label="Unscheduled" value={unscheduled} tone={unscheduled > 0 ? "warning" : "default"} />
      </div>
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {sessions.slice(0, 10).map((s) => (
          <div key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="font-medium text-foreground">{s.title}</span>
            <span className="text-xs text-muted-foreground">{s.starts_at ? format(new Date(s.starts_at), "MMM d, h:mm a") : "TBD"}</span>
          </div>
        ))}
        {sessions.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">No sessions yet.</p>}
      </div>
    </div>
  );
}
