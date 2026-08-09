import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Radio, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button, Checkbox } from "@opensession/ui";
import { toast } from "sonner";
import { dashboardApi, tasksApi, speakersApi, ApiError } from "../../api";
import { StatTile } from "../../components/stat-tile";
import { EmptyState } from "../../components/empty-state";
import { DonutChart } from "../../components/charts/DonutChart";
import { Sparkles } from "lucide-react";

/**
 * Required real-time onboarding dashboard (product plan §6.3 / §31.6). Polls every
 * 10s and shows an honest "Live · updated Ns ago" signal rather than pretending
 * polling is push (frontend plan §9) — the transport can be swapped for SSE later
 * without changing this component's shape.
 */
export function OnboardingBlock({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, dataUpdatedAt } = useQuery({
    queryKey: ["onboarding", eventId],
    queryFn: () => dashboardApi.onboarding(eventId),
    enabled: Boolean(eventId),
    refetchInterval: 10_000,
  });

  // The onboarding view only has person-level aggregates; reminders target task
  // assignment ids, so we need the open assignments to resolve person -> assignment.
  const { data: openAssignments } = useQuery({
    queryKey: ["task-assignments", eventId, "open"],
    queryFn: () => tasksApi.listAssignments(eventId, { status: "open" }),
    enabled: Boolean(eventId),
  });
  const assignmentsByPerson = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of openAssignments ?? []) {
      map.set(a.person_id, [...(map.get(a.person_id) ?? []), a.id]);
    }
    return map;
  }, [openAssignments]);

  const remind = useMutation({
    mutationFn: (personIds: string[]) => {
      const assignmentIds = personIds.flatMap((id) => assignmentsByPerson.get(id) ?? []);
      return tasksApi.remind(eventId, assignmentIds);
    },
    onSuccess: (res) => {
      toast.success(`Reminder sent for ${res.sent} outstanding task${res.sent === 1 ? "" : "s"}`);
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["onboarding", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not send reminders"),
  });

  const { data: speakers } = useQuery({
    queryKey: ["speakers", eventId],
    queryFn: () => speakersApi.list(eventId),
    enabled: Boolean(eventId),
  });

  if (!data) return null;

  const outstandingSpeakers = data.speakers.filter((s) => s.outstanding_tasks > 0);
  const confirmed = speakers?.filter((s) => s.confirmation_status === "confirmed").length ?? 0;
  const unconfirmed = (speakers?.length ?? 0) - confirmed;

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Speaker onboarding</h2>
          <p className="text-xs text-muted-foreground">Outstanding tasks for accepted speakers.</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Radio className="h-3 w-3 text-success" />
          Updated {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <StatTile label="Accepted speakers" value={data.total_accepted_speakers} />
        <StatTile label="Fully ready" value={data.fully_ready} />
        <StatTile label="Outstanding" value={data.outstanding} tone={data.outstanding > 0 ? "warning" : "default"} />
        <StatTile label="Avg. completion" value={`${data.average_completion_percent}%`} />
      </div>

      <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2">
        {Object.keys(data.outstanding_by_task).length > 0 && (
          <div className="space-y-1.5 rounded-lg border border-border p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Outstanding by task</p>
            {Object.entries(data.outstanding_by_task).map(([task, count]) => (
              <div key={task} className="flex items-center gap-2 text-xs">
                <span className="w-32 shrink-0 truncate text-muted-foreground">{task}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-warning"
                    style={{ width: `${Math.min(100, (count / Math.max(1, data.total_accepted_speakers)) * 100)}%` }}
                  />
                </div>
                <span className="w-5 text-right tabular-nums text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        )}
        {(speakers?.length ?? 0) > 0 && (
          <div className="rounded-lg border border-border p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Speaker confirmation mix</p>
            <DonutChart
              slices={[
                { label: "Confirmed", value: confirmed, color: "var(--success)" },
                { label: "Unconfirmed", value: unconfirmed, color: "var(--warning)" },
              ]}
            />
          </div>
        )}
      </div>

      {outstandingSpeakers.length === 0 ? (
        <div className="px-4 pb-4">
          <EmptyState icon={Sparkles} title="Everyone's ready" description="No accepted speakers have outstanding onboarding work." />
        </div>
      ) : (
        <div className="border-t border-border">
          <div className="flex items-center justify-between px-4 py-2">
            <p className="text-xs font-medium text-muted-foreground">Speakers with outstanding work</p>
            <Button
              size="sm"
              variant="outline"
              disabled={selected.size === 0 || remind.isPending}
              onClick={() => remind.mutate(Array.from(selected))}
            >
              <Send className="h-3.5 w-3.5" />
              Send reminder{selected.size > 0 ? ` (${selected.size})` : ""}
            </Button>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {outstandingSpeakers.map((speaker) => (
                <tr key={speaker.person_id}>
                  <td className="w-8 px-4 py-2">
                    <Checkbox
                      checked={selected.has(speaker.person_id)}
                      onCheckedChange={(v) => {
                        const next = new Set(selected);
                        if (v) next.add(speaker.person_id);
                        else next.delete(speaker.person_id);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <p className="font-medium text-foreground">
                      {[speaker.first_name, speaker.last_name].filter(Boolean).join(" ") || speaker.email}
                    </p>
                    <p className="text-xs text-muted-foreground">{speaker.email}</p>
                  </td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {speaker.missing_headshot ? "Missing headshot · " : ""}
                    {speaker.missing_slides ? "Missing slides" : ""}
                  </td>
                  <td className="px-2 py-2 text-right text-xs tabular-nums text-warning">
                    {speaker.outstanding_tasks} outstanding
                  </td>
                  <td className="w-24 px-4 py-2 text-right text-xs tabular-nums text-muted-foreground">
                    {speaker.onboarding_completion_percent}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
