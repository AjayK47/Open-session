import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ClipboardCheck } from "lucide-react";
import { evaluationsApi } from "../../api";
import { EmptyState } from "../../components/empty-state";
import { StatusPill, REVIEW_STATUS_TONE } from "../../components/status-pill";

export function ReviewerAssignmentsPage() {
  const { data: assignments, isLoading } = useQuery({ queryKey: ["reviewer-assignments"], queryFn: evaluationsApi.myAssignments });

  const assigned = assignments?.filter((a) => a.status === "assigned").length ?? 0;
  const completed = assignments?.filter((a) => a.status === "completed").length ?? 0;
  const remaining = (assignments?.length ?? 0) - completed;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">My Assignments</h1>
        <p className="text-sm text-muted-foreground">Submissions assigned to you for review.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-semibold tabular-nums">{assignments?.length ?? "–"}</p>
          <p className="text-xs text-muted-foreground">Assigned</p>
        </div>
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-semibold tabular-nums">{completed}</p>
          <p className="text-xs text-muted-foreground">Completed</p>
        </div>
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-semibold tabular-nums">{remaining}</p>
          <p className="text-xs text-muted-foreground">Remaining</p>
        </div>
      </div>

      {!isLoading && (!assignments || assignments.length === 0) ? (
        <EmptyState icon={ClipboardCheck} title="No assignments yet" description="Check back once an organizer assigns you submissions." />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {assignments?.map((assignment) => (
            <Link key={assignment.id} to={`submissions/${assignment.submission_id}`} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/50">
              <div>
                <p className="text-sm font-medium text-foreground">{assignment.title || "Untitled"}</p>
                <p className="text-xs text-muted-foreground">{assignment.plan_name}{assignment.due_at ? ` · Due ${new Date(assignment.due_at).toLocaleDateString()}` : ""}</p>
              </div>
              <StatusPill label={assignment.status} tone={REVIEW_STATUS_TONE[assignment.status] ?? "neutral"} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
