import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, ListTodo, Plus, Send, Sparkles } from "lucide-react";
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, cn, Checkbox, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@opensession/ui";
import { toast } from "sonner";
import { taskTemplateSchema } from "@opensession/schemas";
import type { TaskAssignment, TaskTemplate, TaskTemplateInput } from "@opensession/schemas";
import { createColumnHelper, DataTable } from "../../components/data-table";
import { tasksApi, eventsApi, portalFormsApi, speakersApi, ApiError } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { PageHeader } from "../../layouts/organizer-shell";
import { DrawerForm } from "../../components/drawer-form";
import { EmptyState } from "../../components/empty-state";
import { StatusPill, TASK_STATUS_TONE } from "../../components/status-pill";

const TASK_TYPES = ["confirmation", "profile", "file_upload", "form", "custom"] as const;
const TARGET_TABS = [
  { key: "all", label: "All Tasks" },
  { key: "contact", label: "Contact Tasks" },
  { key: "group", label: "Group Tasks" },
  { key: "submission", label: "Submission Tasks" },
] as const;

const assignmentColumnHelper = createColumnHelper<TaskAssignment>();

export function TasksPage() {
  const { eventId } = useCurrentEvent();
  return (
    <div>
      <PageHeader icon={ListTodo} title="Tasks" subtitle="Onboarding task templates and per-speaker assignments." />
      <div className="px-6 py-6">
        <Tabs defaultValue="assignments">
          <TabsList>
            <TabsTrigger value="assignments">Assignments</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>
          <TabsContent value="assignments" className="mt-4">
            <AssignmentsPanel eventId={eventId} />
          </TabsContent>
          <TabsContent value="templates" className="mt-4">
            <TemplatesPanel eventId={eventId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function AssignmentsPanel({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("all");
  const { data = [], isLoading } = useQuery({ queryKey: ["task-assignments", eventId, status], queryFn: () => tasksApi.listAssignments(eventId, status === "all" ? undefined : { status }) });
  const { data: templates = [] } = useQuery({ queryKey: ["task-templates", eventId], queryFn: () => tasksApi.listTemplates(eventId) });
  const { data: speakers = [] } = useQuery({ queryKey: ["speakers", eventId, "all"], queryFn: () => speakersApi.list(eventId) });

  const remind = useMutation({
    mutationFn: (ids: string[]) => tasksApi.remind(eventId, ids),
    onSuccess: (res) => {
      toast.success(`Sent ${res.sent} reminder(s)`);
      void queryClient.invalidateQueries({ queryKey: ["task-assignments", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not send reminders"),
  });
  const assign = useMutation({
    mutationFn: () => tasksApi.assignTemplate(eventId, templateId, personIds, dueDate ? new Date(`${dueDate}T23:59:00`).toISOString() : undefined),
    onSuccess: (result) => {
      toast.success(`Assigned to ${result.created} speaker(s)`);
      setAssignOpen(false);
      setTemplateId("");
      setPersonIds([]);
      setDueDate("");
      void queryClient.invalidateQueries({ queryKey: ["task-assignments", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not assign task"),
  });

  const columns = [
    assignmentColumnHelper.accessor("person_name", { header: "Speaker", cell: (info) => info.getValue() || info.row.original.person_email || "—" }),
    assignmentColumnHelper.accessor("name", { header: "Task" }),
    assignmentColumnHelper.accessor("status", {
      header: "Status",
      cell: (info) => <StatusPill label={info.getValue()} tone={TASK_STATUS_TONE[info.getValue()] ?? "neutral"} />,
    }),
    assignmentColumnHelper.accessor("due_at", { header: "Due", cell: (info) => (info.getValue() ? new Date(info.getValue()!).toLocaleDateString() : "—") }),
  ];

  return (
    <>
    <DataTable
      columns={columns}
      data={data}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      searchPlaceholder="Search assignments..."
      enableSelection
      savedViews={{ eventId, resourceType: "tasks" }}
      emptyTitle="No task assignments yet"
      toolbarLeft={<Select value={status} onValueChange={setStatus}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="open">Incomplete</SelectItem><SelectItem value="completed">Complete</SelectItem></SelectContent></Select>}
      toolbarRight={<Button size="sm" onClick={() => setAssignOpen(true)}><Plus className="size-4" />Assign task</Button>}
      bulkActions={(ids, clear) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            remind.mutate(ids);
            clear();
          }}
        >
          <Send className="h-3.5 w-3.5" />
          Send reminder
        </Button>
      )}
    />
    <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Assign onboarding task</DialogTitle><DialogDescription>Choose a task, deadline, and one or more speakers.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Task template</Label><Select value={templateId} onValueChange={setTemplateId}><SelectTrigger><SelectValue placeholder="Choose a task" /></SelectTrigger><SelectContent>{templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Due date</Label><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
          <div className="space-y-1.5"><div className="flex items-center justify-between"><Label>Speakers</Label><button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setPersonIds(personIds.length === speakers.length ? [] : speakers.map((speaker) => speaker.person_id))}>{personIds.length === speakers.length ? "Clear all" : "Select all"}</button></div><div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-2">{speakers.map((speaker) => <label key={speaker.person_id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-secondary"><Checkbox checked={personIds.includes(speaker.person_id)} onCheckedChange={(checked) => setPersonIds((current) => checked ? [...current, speaker.person_id] : current.filter((id) => id !== speaker.person_id))} /><span className="text-sm"><span className="font-medium">{`${speaker.first_name ?? ""} ${speaker.last_name ?? ""}`.trim() || speaker.email}</span><span className="ml-2 text-muted-foreground">{speaker.email}</span></span></label>)}</div></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button><Button onClick={() => assign.mutate()} disabled={!templateId || !dueDate || personIds.length === 0 || assign.isPending}>{assign.isPending ? "Assigning…" : `Assign to ${personIds.length || ""} speaker${personIds.length === 1 ? "" : "s"}`}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

function TemplatesPanel({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [target, setTarget] = useState<string>("all");
  const [copyOpen, setCopyOpen] = useState(false);
  const { data = [], isLoading } = useQuery({ queryKey: ["task-templates", eventId], queryFn: () => tasksApi.listTemplates(eventId) });
  // Only needed for form-type templates, but the drawer switches type inline, so
  // the list has to already be there when the user picks "form".
  const { data: portalForms = [] } = useQuery({
    queryKey: ["portal-forms", eventId],
    queryFn: () => portalFormsApi.list(eventId),
  });
  const visible = target === "all" ? data : data.filter((t) => (t.target_type ?? "contact") === target);

  const form = useForm<TaskTemplateInput>({
    resolver: zodResolver(taskTemplateSchema),
    defaultValues: { name: "", instructions: "", task_type: "confirmation", required: true, due_rule: {}, target_type: "contact", portal_form_id: null },
  });

  function openNew() {
    setEditing(null);
    form.reset({ name: "", instructions: "", task_type: "confirmation", required: true, due_rule: {}, target_type: "contact", portal_form_id: null });
    setOpen(true);
  }
  function openEdit(template: TaskTemplate) {
    setEditing(template);
    form.reset({ name: template.name, instructions: template.instructions ?? "", task_type: template.task_type, required: template.required, due_rule: template.due_rule, target_type: template.target_type ?? "contact", portal_form_id: template.portal_form_id ?? null });
    setOpen(true);
  }

  const starterPack = useMutation({
    mutationFn: () => tasksApi.createStarterPack(eventId),
    onSuccess: (res) => {
      toast.success(res.created > 0 ? `Added ${res.created} starter tasks` : "Starter tasks are already set up");
      void queryClient.invalidateQueries({ queryKey: ["task-templates", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["portal-forms", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not add starter tasks"),
  });

  const save = useMutation({
    mutationFn: (values: TaskTemplateInput) => (editing ? tasksApi.updateTemplate(editing.id, values) : tasksApi.createTemplate(eventId, values)),
    onSuccess: () => {
      toast.success("Task template saved");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["task-templates", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save template"),
  });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {TARGET_TABS.map((tab) => {
            const count = tab.key === "all" ? data.length : data.filter((t) => (t.target_type ?? "contact") === tab.key).length;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setTarget(tab.key)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                  target === tab.key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary",
                )}
              >
                {tab.label}
                <span className="ml-1.5 tabular text-xs text-muted-foreground">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => starterPack.mutate()} disabled={starterPack.isPending}>
            <Sparkles className="h-4 w-4" />
            {starterPack.isPending ? "Adding…" : "Add starter tasks"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCopyOpen(true)}>
            <Copy className="h-4 w-4" />
            Copy from…
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4" />
            Add task template
          </Button>
        </div>
      </div>
      {!isLoading && visible.length === 0 ? (
        <EmptyState icon={ListTodo} title="No task templates yet" description="e.g. Upload headshot, Complete biography, Confirm attendance." />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {visible.map((template) => (
            <button key={template.id} onClick={() => openEdit(template)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-secondary/50">
              <div>
                <p className="text-sm font-medium text-foreground">{template.name}</p>
                <p className="text-xs capitalize text-muted-foreground">
                  {template.task_type.replace(/_/g, " ")} · {(template.target_type ?? "contact")}
                </p>
              </div>
              {template.required && <span className="text-xs text-warning">Required</span>}
            </button>
          ))}
        </div>
      )}

      <CopyTemplatesDialog eventId={eventId} open={copyOpen} onOpenChange={setCopyOpen} />

      <DrawerForm
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit task template" : "Add task template"}
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        isSubmitting={save.isPending}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input {...form.register("name")} placeholder="Upload headshot" />
          </div>
          <div className="space-y-1.5">
            <Label>Instructions</Label>
            <Textarea rows={3} {...form.register("instructions")} />
          </div>
          <div className="space-y-1.5">
            <Label>Applies to</Label>
            <Select value={form.watch("target_type") ?? "contact"} onValueChange={(v) => form.setValue("target_type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGET_TABS.filter((t) => t.key !== "all").map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Task type</Label>
            <Select value={form.watch("task_type")} onValueChange={(v) => form.setValue("task_type", v as never)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.watch("task_type") === "form" && (
            <div className="space-y-1.5">
              <Label>Portal form</Label>
              <Select
                value={form.watch("portal_form_id") ?? ""}
                onValueChange={(v) => form.setValue("portal_form_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={portalForms.length ? "Select a form" : "No portal forms yet"} />
                </SelectTrigger>
                <SelectContent>
                  {portalForms.map((portalForm) => (
                    <SelectItem key={portalForm.id} value={portalForm.id}>
                      {portalForm.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Without this the assignment has nothing to resolve: the portal's
                  form endpoint 400s and the speaker sees an empty task. */}
              <p className="text-xs text-muted-foreground">
                {portalForms.length
                  ? "Speakers complete this form from their portal task."
                  : "Create one under Portal Forms first — a form task needs a form to open."}
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Due offset (days after acceptance)</Label>
            <Input
              type="number"
              value={String((form.watch("due_rule")?.offset_days as number | undefined) ?? "")}
              onChange={(e) => form.setValue("due_rule", { offset_days: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <Label>Required</Label>
            <Switch checked={Boolean(form.watch("required"))} onCheckedChange={(v) => form.setValue("required", v)} />
          </div>
        </div>
      </DrawerForm>
    </>
  );
}

/** Clones task templates from another event. The API requires write access to
 *  both events, so events the user cannot write are simply absent from the list. */
function CopyTemplatesDialog({
  eventId,
  open,
  onOpenChange,
}: {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [sourceEventId, setSourceEventId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: eventsApi.list, enabled: open });
  const { data: sourceTemplates = [] } = useQuery({
    queryKey: ["task-templates", sourceEventId],
    queryFn: () => tasksApi.listTemplates(sourceEventId),
    enabled: Boolean(sourceEventId),
  });

  const copy = useMutation({
    mutationFn: () => tasksApi.copyTemplatesFrom(eventId, sourceEventId, selected),
    onSuccess: (res) => {
      toast.success(`Copied ${res.templates.length} template(s)`);
      void queryClient.invalidateQueries({ queryKey: ["task-templates", eventId] });
      onOpenChange(false);
      setSourceEventId("");
      setSelected([]);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not copy templates"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy task templates</DialogTitle>
          <DialogDescription>Reuse onboarding tasks you already set up on another event.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Source event</Label>
            <Select
              value={sourceEventId}
              onValueChange={(v) => {
                setSourceEventId(v);
                setSelected([]);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose an event" />
              </SelectTrigger>
              <SelectContent>
                {events
                  .filter((e) => e.id !== eventId)
                  .map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {sourceEventId && (
            <div className="space-y-1.5">
              <Label>Templates</Label>
              {sourceTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground">That event has no task templates.</p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {sourceTemplates.map((template) => (
                    <label key={template.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary">
                      <Checkbox
                        checked={selected.includes(template.id)}
                        onCheckedChange={(v) =>
                          setSelected((prev) => (v ? [...prev, template.id] : prev.filter((id) => id !== template.id)))
                        }
                      />
                      <span className="truncate text-foreground">{template.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => copy.mutate()} disabled={selected.length === 0 || copy.isPending}>
              {copy.isPending ? "Copying…" : `Copy ${selected.length || ""}`.trim()}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
