import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ClipboardCheck, Plus } from "lucide-react";
import { Button } from "@opensession/ui";
import { evaluationsApi } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { PageHeader } from "../../layouts/organizer-shell";
import { EmptyState } from "../../components/empty-state";

export function EvaluationsListPage() {
  const { eventId } = useCurrentEvent();
  const { data: plans, isLoading } = useQuery({ queryKey: ["evaluation-plans", eventId], queryFn: () => evaluationsApi.list(eventId) });

  return (
    <div>
      <PageHeader
        icon={ClipboardCheck}
        title="Evaluations"
        subtitle="Scoring rubrics and reviewer assignments."
        actions={
          <Button size="sm" asChild>
            <Link to={`/app/events/${eventId}/evaluations/new`}>
              <Plus className="h-4 w-4" />
              Evaluation Plan
            </Link>
          </Button>
        }
      />
      <div className="px-6 py-6">
        {!isLoading && (!plans || plans.length === 0) ? (
          <EmptyState icon={ClipboardCheck} title="No evaluation plans yet" description="Create a rubric and assign reviewers to submissions." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans?.map((plan) => (
              <Link key={plan.id} to={`/app/events/${eventId}/evaluations/${plan.id}`} className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40">
                <p className="font-medium text-foreground">{plan.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{plan.criteria.length} criteria · {plan.reviews_required} review(s) required</p>
                <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                  <span>{plan.assigned_submissions} assigned</span>
                  <span>{plan.completed_reviews} completed</span>
                  <span>{plan.in_progress_reviews} in progress</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
