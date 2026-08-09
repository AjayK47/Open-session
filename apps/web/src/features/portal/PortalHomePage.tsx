import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ArrowRight, CalendarDays, CheckCircle2, FileText, ListTodo, MapPin, User } from "lucide-react";
import { Button, cn } from "@opensession/ui";
import { meApi } from "../../api";
import { usePortalEvent } from "./usePortalEvent";
import { StatusPill, SUBMISSION_STATUS_TONE, TASK_STATUS_TONE } from "../../components/status-pill";

const PROFILE_FIELDS = ["first_name", "last_name", "bio", "company", "job_title"] as const;

export function PortalHomePage() {
  const { event, eventSlug } = usePortalEvent();
  const { data: submissions = [] } = useQuery({ queryKey: ["me", "submissions"], queryFn: meApi.submissions });
  const { data: tasks = [] } = useQuery({ queryKey: ["me", "tasks"], queryFn: meApi.tasks });
  const { data: sessions = [] } = useQuery({ queryKey: ["me", "sessions"], queryFn: meApi.sessions });
  const { data: profile } = useQuery({ queryKey: ["me", "profile"], queryFn: meApi.profile });

  const eventSubmissions = event ? submissions.filter((s) => s.event_id === event.id) : submissions;
  const eventTasks = event ? tasks.filter((t) => t.event_id === event.id) : tasks;
  const eventSessions = event ? sessions.filter((s) => s.event_id === event.id) : sessions;
  const outstanding = eventTasks.filter((t) => t.status !== "completed");

  const filled = profile ? PROFILE_FIELDS.filter((f) => profile[f]).length : 0;
  const profilePercent = Math.round((filled / PROFILE_FIELDS.length) * 100);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Welcome back{profile?.first_name ? `, ${profile.first_name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {outstanding.length === 0
            ? "You're all caught up — nothing needs your attention right now."
            : `You have ${outstanding.length} task${outstanding.length === 1 ? "" : "s"} waiting on you.`}
        </p>
      </header>

      {/* What's due comes first and unclipped. Everything else on this page is a
          summary the speaker can skim; this is the only part that asks them to act. */}
      {outstanding.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-warning/25 bg-warning/[0.06]">
          <div className="flex items-center justify-between gap-3 border-b border-warning/20 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ListTodo className="size-4 text-warning" />
              Needs your attention
            </h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/portal/${eventSlug}/tasks`}>
                Open tasks
                <ArrowRight />
              </Link>
            </Button>
          </div>
          <ul className="divide-y divide-warning/15">
            {outstanding.slice(0, 4).map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{task.name}</p>
                  {task.due_at && (
                    <p className="text-xs text-muted-foreground">
                      Due {new Date(task.due_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                  )}
                </div>
                <StatusPill label={task.status} tone={TASK_STATUS_TONE[task.status] ?? "neutral"} />
              </li>
            ))}
          </ul>
          {outstanding.length > 4 && (
            <p className="px-4 py-2.5 text-xs text-muted-foreground">
              +{outstanding.length - 4} more on the tasks page
            </p>
          )}
        </section>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <PanelCard
          icon={FileText}
          title="My submissions"
          href={`/portal/${eventSlug}/submissions`}
          count={eventSubmissions.length}
        >
          {eventSubmissions.length === 0 ? (
            <Empty>Nothing submitted yet.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {eventSubmissions.slice(0, 4).map((submission) => (
                <li key={submission.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="truncate text-sm text-foreground">{submission.title || "Untitled"}</span>
                  <StatusPill
                    label={submission.status}
                    tone={SUBMISSION_STATUS_TONE[submission.status] ?? "neutral"}
                  />
                </li>
              ))}
            </ul>
          )}
        </PanelCard>

        <PanelCard
          icon={CalendarDays}
          title="My sessions"
          href={`/portal/${eventSlug}/submissions`}
          count={eventSessions.length}
        >
          {eventSessions.length === 0 ? (
            <Empty>Nothing scheduled yet — you&apos;ll see times here once the agenda is published.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {eventSessions.map((session) => (
                <li key={session.id} className="py-2.5">
                  <p className="truncate text-sm text-foreground">{session.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3" />
                      {session.starts_at
                        ? new Intl.DateTimeFormat(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: event?.timezone || "UTC",
                          }).format(new Date(session.starts_at))
                        : "Time TBD"}
                    </span>
                    {session.room_name && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" />
                        {session.room_name}
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>

        <PanelCard icon={User} title="My profile" href={`/portal/${eventSlug}/profile`}>
          <div className="flex items-center gap-3 py-1">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500",
                  profilePercent === 100 ? "bg-success" : "bg-primary",
                )}
                style={{ width: `${profilePercent}%` }}
              />
            </div>
            <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">{profilePercent}%</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {profilePercent === 100 ? (
              <span className="inline-flex items-center gap-1 text-success">
                <CheckCircle2 className="size-3.5" />
                Your profile is complete
              </span>
            ) : (
              `${PROFILE_FIELDS.length - filled} field${PROFILE_FIELDS.length - filled === 1 ? "" : "s"} left — your bio and photo appear on the public program.`
            )}
          </p>
        </PanelCard>

        <PanelCard
          icon={ListTodo}
          title="Completed tasks"
          href={`/portal/${eventSlug}/tasks`}
          count={eventTasks.length - outstanding.length}
        >
          {eventTasks.length - outstanding.length === 0 ? (
            <Empty>Nothing completed yet.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {eventTasks
                .filter((t) => t.status === "completed")
                .slice(0, 4)
                .map((task) => (
                  <li key={task.id} className="flex items-center gap-2 py-2.5 text-sm text-muted-foreground">
                    <CheckCircle2 className="size-4 shrink-0 text-success" />
                    <span className="truncate line-through">{task.name}</span>
                  </li>
                ))}
            </ul>
          )}
        </PanelCard>
      </div>
    </div>
  );
}

/**
 * A summary panel with a heading link.
 *
 * The link is the *title*, not the whole card: the previous version wrapped the
 * entire card in `<Link>` and then nested buttons inside it, which is invalid
 * HTML and forced `preventDefault()` calls on every inner control.
 */
function PanelCard({
  icon: Icon,
  title,
  href,
  count,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  href: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-1 flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <h2 className="text-sm font-medium text-foreground">
          <Link
            to={href}
            className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {title}
          </Link>
        </h2>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
        <ArrowRight className="ml-auto size-3.5 text-muted-foreground/60" />
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-muted-foreground">{children}</p>;
}
