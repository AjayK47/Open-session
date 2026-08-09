import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { differenceInCalendarDays, format } from "date-fns";
import {
  FileText,
  Clock,
  CheckCircle2,
  Mic,
  CalendarDays,
  ListTodo,
  ArrowRight,
  Send,
} from "lucide-react";
import { Button, Progress } from "@opensession/ui";
import { dashboardApi } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { PageHeader } from "../../layouts/organizer-shell";
import { StatTile } from "../../components/stat-tile";
import { OnboardingBlock } from "../dashboard/OnboardingBlock";

export function OverviewPage() {
  const { event, eventId } = useCurrentEvent();
  const { data: metrics } = useQuery({
    queryKey: ["metrics", eventId],
    queryFn: () => dashboardApi.metrics(eventId),
    enabled: Boolean(eventId),
  });

  const daysToEvent = event?.starts_at ? differenceInCalendarDays(new Date(event.starts_at), new Date()) : null;

  const actionItems = [
    metrics && metrics.pending_review > 0
      ? { text: `${metrics.pending_review} submission${metrics.pending_review === 1 ? "" : "s"} still need a decision`, href: `/app/events/${eventId}/submissions` }
      : null,
    metrics && metrics.unscheduled_sessions > 0
      ? { text: `${metrics.unscheduled_sessions} accepted session${metrics.unscheduled_sessions === 1 ? "" : "s"} still need a time slot`, href: `/app/events/${eventId}/agenda` }
      : null,
    metrics && metrics.overdue_tasks > 0
      ? { text: `${metrics.overdue_tasks} speaker task${metrics.overdue_tasks === 1 ? "" : "s"} overdue`, href: `/app/events/${eventId}/tasks` }
      : null,
  ].filter((x): x is { text: string; href: string } => Boolean(x));

  return (
    <div>
      <PageHeader
        title={event?.name ?? "Overview"}
        subtitle={
          event?.starts_at
            ? `${format(new Date(event.starts_at), "MMM d")} – ${event.ends_at ? format(new Date(event.ends_at), "MMM d, yyyy") : ""}${
                daysToEvent !== null ? ` · ${daysToEvent >= 0 ? `${daysToEvent} days to event` : "In progress or past"}` : ""
              }`
            : undefined
        }
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/app/events/${eventId}/forms`}>View CFP</Link>
            </Button>
          </>
        }
      />

      <div className="space-y-6 px-6 py-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Submissions" value={metrics?.total_submissions ?? "–"} icon={FileText} href={`/app/events/${eventId}/submissions`} />
          <StatTile label="Pending review" value={metrics?.pending_review ?? "–"} icon={Clock} href={`/app/events/${eventId}/submissions?status=pending_review`} tone="warning" />
          <StatTile label="Accepted" value={metrics?.accepted_submissions ?? "–"} icon={CheckCircle2} href={`/app/events/${eventId}/submissions?status=accepted`} />
          <StatTile label="Accepted speakers" value={metrics?.accepted_speakers ?? "–"} icon={Mic} href={`/app/events/${eventId}/speakers`} />
          <StatTile label="Scheduled sessions" value={metrics?.scheduled_sessions ?? "–"} icon={CalendarDays} href={`/app/events/${eventId}/agenda`} />
          <StatTile label="Outstanding tasks" value={metrics?.outstanding_tasks ?? "–"} icon={ListTodo} href={`/app/events/${eventId}/tasks`} tone={metrics && metrics.overdue_tasks > 0 ? "danger" : "default"} />
        </div>

        {actionItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
            <span className="font-medium text-muted-foreground">Also check:</span>
            {actionItems.map((item, i) => (
              <Link key={i} to={item.href} className="inline-flex items-center gap-1 text-foreground hover:text-primary">
                {item.text}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ))}
          </div>
        )}

        {event?.starts_at && metrics && metrics.total_submissions === 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            <Send className="h-4 w-4" />
            No submissions yet — create a submission form to open your call for speakers.
            <Link to={`/app/events/${eventId}/forms/new`} className="font-medium text-primary hover:underline">
              Create form
            </Link>
          </div>
        )}

        <OnboardingBlock eventId={eventId} />

        {metrics && (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-3 text-sm font-medium text-foreground">Session scheduling</p>
            <Progress
              value={
                metrics.scheduled_sessions + metrics.unscheduled_sessions === 0
                  ? 0
                  : (metrics.scheduled_sessions / (metrics.scheduled_sessions + metrics.unscheduled_sessions)) * 100
              }
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {metrics.scheduled_sessions} of {metrics.scheduled_sessions + metrics.unscheduled_sessions} sessions scheduled
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
