import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { FileText, Plus, Copy, ExternalLink, MoreHorizontal, Trash2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@opensession/ui";
import type { SubmissionForm } from "@opensession/schemas";
import { toast } from "sonner";
import { formsApi, ApiError } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { PageHeader } from "../../layouts/organizer-shell";
import { EmptyState } from "../../components/empty-state";
import { StatusPill, FORM_STATUS_TONE } from "../../components/status-pill";

export function FormsListPage() {
  const { event, eventId } = useCurrentEvent();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [formToDelete, setFormToDelete] = useState<SubmissionForm | null>(null);
  const { data: forms, isLoading } = useQuery({ queryKey: ["forms", eventId], queryFn: () => formsApi.list(eventId) });

  const publish = useMutation({
    mutationFn: (formId: string) => formsApi.publish(formId),
    onSuccess: () => {
      toast.success("Form opened");
      void queryClient.invalidateQueries({ queryKey: ["forms", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not publish"),
  });
  const close = useMutation({
    mutationFn: (formId: string) => formsApi.close(formId),
    onSuccess: () => {
      toast.success("Form closed");
      void queryClient.invalidateQueries({ queryKey: ["forms", eventId] });
    },
  });
  const duplicate = useMutation({
    mutationFn: (formId: string) => formsApi.duplicate(formId),
    onSuccess: (form) => {
      toast.success("Form duplicated");
      void queryClient.invalidateQueries({ queryKey: ["forms", eventId] });
      navigate(`/app/events/${eventId}/forms/${form.id}/edit`);
    },
  });
  const remove = useMutation({
    mutationFn: (formId: string) => formsApi.remove(formId),
    onSuccess: () => {
      toast.success("Form deleted");
      setFormToDelete(null);
      void queryClient.invalidateQueries({ queryKey: ["forms", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not delete form"),
  });

  return (
    <div>
      <PageHeader
        icon={FileText}
        title="Submission Forms"
        subtitle="Collect abstract, session, and participant information for your event."
        actions={
          <Button size="sm" asChild>
            <Link to={`/app/events/${eventId}/forms/new`}>
              <Plus className="h-4 w-4" />
              Create Form
            </Link>
          </Button>
        }
      />
      <div className="px-6 py-6">
        {!isLoading && (!forms || forms.length === 0) ? (
          <EmptyState
            icon={FileText}
            title="No forms yet"
            description="Create a call-for-speakers form to start collecting submissions."
            action={
              <Button size="sm" asChild>
                <Link to={`/app/events/${eventId}/forms/new`}>Create Form</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {forms?.map((form) => (
              <div key={form.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
                <Link to={`/app/events/${eventId}/forms/${form.id}/edit`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{form.internal_name}</p>
                    <StatusPill label={form.status} tone={FORM_STATUS_TONE[form.status] ?? "neutral"} />
                    <span className="text-xs text-muted-foreground">{form.submission_type}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {form.public_title} · {form.close_at ? `Closes ${new Date(form.close_at).toLocaleDateString()}` : "No close date"}
                  </p>
                </Link>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      void navigator.clipboard.writeText(`${window.location.origin}/submit/${event?.slug}/${form.slug}`);
                      toast.success("Link copied");
                    }}
                    aria-label="Copy link"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" asChild>
                    <a href={`/submit/${event?.slug}/${form.slug}`} target="_blank" rel="noreferrer" aria-label="Preview">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {form.status !== "open" && <DropdownMenuItem onSelect={() => publish.mutate(form.id)}>Open</DropdownMenuItem>}
                      {form.status === "open" && <DropdownMenuItem onSelect={() => close.mutate(form.id)}>Close</DropdownMenuItem>}
                      <DropdownMenuItem onSelect={() => duplicate.mutate(form.id)}>Duplicate</DropdownMenuItem>
                      <DropdownMenuItem destructive onSelect={() => setFormToDelete(form)}>
                        <Trash2 />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Dialog open={Boolean(formToDelete)} onOpenChange={(open) => !open && setFormToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete submission form?</DialogTitle>
            <DialogDescription>
              “{formToDelete?.internal_name}” will be permanently deleted. Forms that already contain submissions must be closed instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormToDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => formToDelete && remove.mutate(formToDelete.id)}
            >
              {remove.isPending ? "Deleting…" : "Delete form"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
