import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, FileUp, FormInput, ListTodo } from "lucide-react";
import { Button, Checkbox } from "@opensession/ui";
import { toast } from "sonner";
import { meApi, ApiError } from "../../api";
import { usePortalEvent } from "./usePortalEvent";
import { EmptyState } from "../../components/empty-state";
import { StatusPill, TASK_STATUS_TONE } from "../../components/status-pill";
import { FileUploader } from "../../components/file-uploader";
import { DynamicForm } from "../forms/DynamicForm";
import { PortalPageHeader } from "./PortalPageHeader";

type TaskGroup = { key: string; label: string; icon: React.ComponentType<{ className?: string }>; tasks: any[] };

export function PortalTasksPage() {
  const { event } = usePortalEvent();
  const queryClient = useQueryClient();
  const { data: tasks = [], isLoading } = useQuery({ queryKey: ["me", "tasks"], queryFn: meApi.tasks });
  const eventTasks = event ? tasks.filter((t) => t.event_id === event.id) : tasks;

  const complete = useMutation({
    mutationFn: (assignmentId: string) => meApi.completeTask(assignmentId),
    onSuccess: () => {
      toast.success("Task completed");
      void queryClient.invalidateQueries({ queryKey: ["me", "tasks"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not complete task"),
  });

  const groups = useMemo<TaskGroup[]>(() => {
    const actionItems = eventTasks.filter((t) => t.task_type !== "file_upload" && t.task_type !== "form");
    const fileUploads = eventTasks.filter((t) => t.task_type === "file_upload");
    const forms = eventTasks.filter((t) => t.task_type === "form");
    const result: TaskGroup[] = [];
    if (actionItems.length > 0) result.push({ key: "action", label: "Action Items", icon: CheckSquare, tasks: actionItems });
    if (fileUploads.length > 0) result.push({ key: "file", label: "File Uploads", icon: FileUp, tasks: fileUploads });
    if (forms.length > 0) result.push({ key: "form", label: "Forms", icon: FormInput, tasks: forms });
    return result;
  }, [eventTasks]);

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title="Tasks"
        description="What the organizers need from you before the event."
      />
      {!isLoading && eventTasks.length === 0 ? (
        <EmptyState icon={ListTodo} title="Nothing to do right now" />
      ) : groups.length === 1 ? (
        /* Single group — no headers needed */
        <div className="space-y-3">
          {groups[0]!.tasks.map((task) => (
            <TaskCard key={task.id} task={task} event={event} onComplete={(id) => complete.mutate(id)} />
          ))}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <group.icon className="h-4 w-4" />
              {group.label}
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs tabular">{group.tasks.length}</span>
            </div>
            {group.tasks.map((task) => (
              <TaskCard key={task.id} task={task} event={event} onComplete={(id) => complete.mutate(id)} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function TaskCard({
  task,
  event,
  onComplete,
}: {
  task: any;
  event: any;
  onComplete: (id: string) => void;
}) {
  const [formExpanded, setFormExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">{task.name}</p>
          {task.instructions && <p className="mt-0.5 text-sm text-muted-foreground">{task.instructions}</p>}
          {task.due_at && <p className="mt-1 text-xs text-muted-foreground">Due {new Date(task.due_at).toLocaleDateString()}</p>}
        </div>
        <StatusPill label={task.status} tone={TASK_STATUS_TONE[task.status] ?? "neutral"} />
      </div>

      {task.status !== "completed" && (
        <div className="mt-3">
          {task.task_type === "file_upload" && event ? (
            <FileUploader
              eventId={event.id}
              fileType={task.name.toLowerCase().includes("slide") ? "slides" : "supporting"}
              as="me"
              refs={{ task_assignment_id: task.id }}
              onUploaded={() => onComplete(task.id)}
            />
          ) : task.task_type === "form" ? (
            !formExpanded ? (
              <Button variant="outline" size="sm" onClick={() => setFormExpanded(true)}>
                <FormInput className="h-4 w-4 mr-2" />
                Fill Form
              </Button>
            ) : (
              <TaskFormPanel assignmentId={task.id} onClose={() => setFormExpanded(false)} />
            )
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox onCheckedChange={() => onComplete(task.id)} />
              Mark as done
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A form-type task is backed by a portal form the organizer built, so the schema
 * is fetched per assignment rather than carried on the task list payload, and it
 * renders through the same `DynamicForm` as the CFP so the two never drift.
 * Submitting posts the answers *and* completes the assignment server-side — do
 * not also call `completeTask`, or the second call 409s on an already-done task.
 */
function TaskFormPanel({ assignmentId, onClose }: { assignmentId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["me", "tasks", assignmentId, "form"],
    queryFn: () => meApi.taskForm(assignmentId),
  });
  const [answers, setAnswers] = useState<Record<string, unknown> | null>(null);

  // Server answers seed the draft once; after that the local copy owns the state.
  const values = answers ?? data?.answers ?? {};

  const submit = useMutation({
    mutationFn: () => meApi.submitTaskForm(assignmentId, values),
    onSuccess: () => {
      toast.success("Form submitted");
      void queryClient.invalidateQueries({ queryKey: ["me", "tasks"] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message2 : "Could not submit this form"),
  });

  if (isLoading) {
    return <p className="mt-2 text-sm text-muted-foreground">Loading form…</p>;
  }
  if (error || !data) {
    return (
      <div className="mt-2 rounded-md border border-border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">
          {error instanceof ApiError ? error.message2 : "This task has no form attached yet."}
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-4 rounded-md border border-border bg-muted/30 p-4">
      {data.form.description ? <p className="text-sm text-muted-foreground">{data.form.description}</p> : null}
      <DynamicForm
        sections={data.form.sections}
        rules={[]}
        answers={values}
        onChange={(key, value) => setAnswers({ ...values, [key]: value })}
        options={{ tracks: [], formats: [], tags: [] }}
        disabled={submit.isPending}
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={submit.isPending}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => submit.mutate()} disabled={submit.isPending}>
          {submit.isPending ? "Submitting…" : "Submit"}
        </Button>
      </div>
    </div>
  );
}
