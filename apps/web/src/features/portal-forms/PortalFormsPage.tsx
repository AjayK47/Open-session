import { useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Copy, FileStack, FolderUp, Layers, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  IconChip,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cn,
} from "@opensession/ui";
import { toast } from "sonner";
import type { FieldDefinition, FileRequest, PortalForm } from "@opensession/schemas";
import { fieldDefinitionsApi, fileRequestsApi, portalFormsApi, sessionsApi, speakersApi, ApiError } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { PageHeader } from "../../layouts/organizer-shell";
import { DrawerForm } from "../../components/drawer-form";
import { EmptyState } from "../../components/empty-state";

const TARGETS = [
  { key: "contact", label: "Contact" },
  { key: "group", label: "Group" },
  { key: "submission", label: "Submission" },
] as const;

/**
 * Portal forms are the second form system in the product: unlike the public CFP
 * form, these are assigned to portals and completed by participants from inside
 * a task after acceptance. They share the Field Library with everything else.
 */
export function PortalFormsPage() {
  const { eventId } = useCurrentEvent();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = requestedTab === "fields" || requestedTab === "files" ? requestedTab : "forms";
  return (
    <div>
      <PageHeader
        icon={FileStack}
        title="Portal Forms"
        subtitle="Forms, reusable fields, and file requests for your speaker portals."
      />
      <div className="px-6 py-6">
        <Tabs value={activeTab} onValueChange={(value) => setSearchParams(value === "forms" ? {} : { tab: value })}>
          <TabsList>
            <TabsTrigger value="forms">Forms</TabsTrigger>
            <TabsTrigger value="fields">Field Library</TabsTrigger>
            <TabsTrigger value="files">File Requests</TabsTrigger>
          </TabsList>
          <TabsContent value="forms">
            <FormsPanel eventId={eventId} />
          </TabsContent>
          <TabsContent value="fields">
            <FieldLibraryPanel eventId={eventId} />
          </TabsContent>
          <TabsContent value="files">
            <FileRequestsPanel eventId={eventId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function TargetTabs({ value, onChange, counts }: { value: string; onChange: (v: string) => void; counts: Record<string, number> }) {
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="flex items-center gap-1">
      {[{ key: "all", label: "All" }, ...TARGETS].map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
            value === tab.key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary",
          )}
        >
          {tab.label}
          <span className="ml-1.5 tabular text-xs text-muted-foreground">
            {tab.key === "all" ? all : (counts[tab.key] ?? 0)}
          </span>
        </button>
      ))}
    </div>
  );
}

function FormsPanel({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState("all");
  const [open, setOpen] = useState(false);
  const form = useForm<{ name: string; description: string; target_type: string }>({
    defaultValues: { name: "", description: "", target_type: "contact" },
  });

  const { data = [], isLoading } = useQuery({
    queryKey: ["portal-forms", eventId],
    queryFn: () => portalFormsApi.list(eventId),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["portal-forms", eventId] });
  }
  function failed(error: unknown, fallback: string) {
    toast.error(error instanceof ApiError ? error.message2 : fallback);
  }

  const create = useMutation({
    mutationFn: (v: { name: string; description: string; target_type: string }) =>
      portalFormsApi.create(eventId, { name: v.name, description: v.description || null, target_type: v.target_type }),
    onSuccess: () => {
      toast.success("Form created");
      setOpen(false);
      form.reset({ name: "", description: "", target_type: "contact" });
      invalidate();
    },
    onError: (error) => failed(error, "Could not create form"),
  });

  const duplicate = useMutation({
    mutationFn: (formId: string) => portalFormsApi.duplicate(formId),
    onSuccess: () => {
      toast.success("Form duplicated");
      invalidate();
    },
    onError: (error) => failed(error, "Could not duplicate form"),
  });

  const remove = useMutation({
    mutationFn: (formId: string) => portalFormsApi.remove(formId),
    onSuccess: () => {
      toast.success("Form deleted");
      invalidate();
    },
    onError: (error) => failed(error, "Could not delete form"),
  });

  const counts = TARGETS.reduce<Record<string, number>>((acc, t) => {
    acc[t.key] = data.filter((f: PortalForm) => f.target_type === t.key).length;
    return acc;
  }, {});
  const visible = target === "all" ? data : data.filter((f: PortalForm) => f.target_type === target);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <TargetTabs value={target} onChange={setTarget} counts={counts} />
        <Button size="sm" className="ml-auto" onClick={() => setOpen(true)}>
          <Plus />
          Add form
        </Button>
      </div>

      {!isLoading && visible.length === 0 ? (
        <EmptyState
          icon={FileStack}
          title="No portal forms yet"
          description="Create a form to collect information from participants after acceptance."
        />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {visible.map((portalForm: PortalForm) => (
            <div key={portalForm.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <IconChip tone="brand" size="sm">
                  <FileStack />
                </IconChip>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{portalForm.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {portalForm.sections?.length ?? 0} section(s) · {portalForm.target_type}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Badge variant="muted">{portalForm.status}</Badge>
                <Button variant="ghost" size="icon-sm" aria-label="Duplicate" onClick={() => duplicate.mutate(portalForm.id)}>
                  <Copy />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => remove.mutate(portalForm.id)}>
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <DrawerForm
        open={open}
        onOpenChange={setOpen}
        title="Add portal form"
        onSubmit={form.handleSubmit((v) => create.mutate(v))}
        isSubmitting={create.isPending}
        submitLabel="Create form"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input placeholder="Update Your Information" {...form.register("name")} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={3} {...form.register("description")} />
          </div>
          <div className="space-y-1.5">
            <Label>Applies to</Label>
            <Select value={form.watch("target_type")} onValueChange={(v) => form.setValue("target_type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGETS.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </DrawerForm>
    </>
  );
}

function FieldLibraryPanel({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const form = useForm<{ key: string; label: string; field_type: string }>({
    defaultValues: { key: "", label: "", field_type: "short_text" },
  });

  const { data = [], isLoading } = useQuery({
    queryKey: ["field-definitions", eventId],
    queryFn: () => fieldDefinitionsApi.list(eventId),
  });

  const create = useMutation({
    mutationFn: (v: { key: string; label: string; field_type: string }) => fieldDefinitionsApi.create(eventId, v),
    onSuccess: () => {
      toast.success("Field added");
      setOpen(false);
      form.reset({ key: "", label: "", field_type: "short_text" });
      void queryClient.invalidateQueries({ queryKey: ["field-definitions", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not add field"),
  });

  const remove = useMutation({
    mutationFn: (fieldId: string) => fieldDefinitionsApi.remove(fieldId),
    onSuccess: () => {
      toast.success("Field removed");
      void queryClient.invalidateQueries({ queryKey: ["field-definitions", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not remove field"),
  });

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Fields defined once here can be reused across every form.</p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus />
          Add field
        </Button>
      </div>

      {!isLoading && data.length === 0 ? (
        <EmptyState icon={Layers} title="No shared fields yet" description="Add a field to reuse it across forms." />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {data.map((field: FieldDefinition) => (
            <div key={field.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{field.label}</p>
                <p className="font-mono text-xs text-muted-foreground">{field.key}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="muted">{field.field_type}</Badge>
                {field.locked ? (
                  <Badge variant="outline">Locked</Badge>
                ) : (
                  <Button variant="ghost" size="icon-sm" aria-label="Remove field" onClick={() => remove.mutate(field.id)}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <DrawerForm
        open={open}
        onOpenChange={setOpen}
        title="Add field"
        onSubmit={form.handleSubmit((v) => create.mutate(v))}
        isSubmitting={create.isPending}
        submitLabel="Add field"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input placeholder="Dietary requirements" {...form.register("label")} />
          </div>
          <div className="space-y-1.5">
            <Label>Key</Label>
            <Input placeholder="dietary_requirements" {...form.register("key")} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.watch("field_type")} onValueChange={(v) => form.setValue("field_type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["short_text", "long_text", "number", "url", "email", "dropdown", "checkbox", "date", "file"].map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </DrawerForm>
    </>
  );
}

function FileRequestsPanel({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const form = useForm<{ title: string; instructions_html: string; target_type: string; due_at: string; session_id: string; assigned_person_ids: string[]; accepted_extensions: string; max_size_mb: number }>({
    defaultValues: { title: "", instructions_html: "", target_type: "contact", due_at: "", session_id: "", assigned_person_ids: [], accepted_extensions: "pdf,ppt,pptx", max_size_mb: 50 },
  });

  const { data = [], isLoading } = useQuery({
    queryKey: ["file-requests", eventId],
    queryFn: () => fileRequestsApi.list(eventId),
  });
  const { data: speakers = [] } = useQuery({ queryKey: ["speakers", eventId], queryFn: () => speakersApi.list(eventId) });
  const { data: sessions = [] } = useQuery({ queryKey: ["sessions", eventId], queryFn: () => sessionsApi.list(eventId) });

  const create = useMutation({
    mutationFn: (v: { title: string; instructions_html: string; target_type: string; due_at: string; session_id: string; assigned_person_ids: string[]; accepted_extensions: string; max_size_mb: number }) =>
      fileRequestsApi.create(eventId, {
        title: v.title,
        instructions_html: v.instructions_html || null,
        target_type: v.target_type,
        due_at: v.due_at ? new Date(`${v.due_at}T23:59:00`).toISOString() : null,
        session_id: v.session_id || null,
        assigned_person_ids: v.assigned_person_ids,
        accepted_extensions: v.accepted_extensions.split(",").map((item) => item.trim().replace(/^\./, "")).filter(Boolean),
        max_size_mb: Number(v.max_size_mb),
      }),
    onSuccess: () => {
      toast.success("File request created");
      setOpen(false);
      form.reset({ title: "", instructions_html: "", target_type: "contact", due_at: "", session_id: "", assigned_person_ids: [], accepted_extensions: "pdf,ppt,pptx", max_size_mb: 50 });
      void queryClient.invalidateQueries({ queryKey: ["file-requests", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not create file request"),
  });

  const remove = useMutation({
    mutationFn: (requestId: string) => fileRequestsApi.remove(requestId),
    onSuccess: () => {
      toast.success("File request deleted");
      void queryClient.invalidateQueries({ queryKey: ["file-requests", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not delete file request"),
  });

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Collect documents from participants. Files live on the request, not on the contact record.
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus />
          Add request
        </Button>
      </div>

      {!isLoading && data.length === 0 ? (
        <EmptyState icon={FolderUp} title="No file requests yet" description="e.g. Upload signed speaker agreement." />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {data.map((request: FileRequest) => (
            <div key={request.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <IconChip tone="success" size="sm">
                  <FolderUp />
                </IconChip>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{request.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {request.assigned_person_ids.length || "All"} speaker(s) · {request.uploads?.length ?? 0} upload(s)
                    {request.due_at ? ` · due ${new Date(request.due_at).toLocaleDateString()}` : ""}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Delete request" onClick={() => remove.mutate(request.id)}>
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}

      <DrawerForm
        open={open}
        onOpenChange={setOpen}
        title="Add file request"
        onSubmit={form.handleSubmit((v) => create.mutate(v))}
        isSubmitting={create.isPending}
        submitLabel="Create request"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input placeholder="Upload Presentation Slides" {...form.register("title")} />
          </div>
          <div className="space-y-1.5">
            <Label>Instructions</Label>
            <Textarea rows={4} {...form.register("instructions_html")} />
          </div>
          <div className="space-y-1.5">
            <Label>Applies to</Label>
            <Select value={form.watch("target_type")} onValueChange={(v) => form.setValue("target_type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGETS.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Due date</Label>
            <Input type="date" {...form.register("due_at")} />
          </div>
          <div className="space-y-1.5">
            <Label>Associated session</Label>
            <Select value={form.watch("session_id") || "none"} onValueChange={(v) => form.setValue("session_id", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">General request</SelectItem>{sessions.map((session) => <SelectItem key={session.id} value={session.id}>{session.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Accepted extensions</Label><Input placeholder="pdf,ppt,pptx" {...form.register("accepted_extensions")} /></div>
            <div className="space-y-1.5"><Label>Maximum size (MB)</Label><Input type="number" min={1} max={50} {...form.register("max_size_mb", { valueAsNumber: true })} /></div>
          </div>
          <div className="space-y-2">
            <Label>Assign speakers</Label>
            <p className="text-xs text-muted-foreground">Leave everyone unchecked to make the request available to all event speakers.</p>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {speakers.map((speaker) => {
                const selected = form.watch("assigned_person_ids").includes(speaker.person_id);
                const name = [speaker.first_name, speaker.last_name].filter(Boolean).join(" ") || speaker.email;
                return <label key={speaker.person_id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"><Checkbox checked={selected} onCheckedChange={(checked) => form.setValue("assigned_person_ids", checked ? [...form.getValues("assigned_person_ids"), speaker.person_id] : form.getValues("assigned_person_ids").filter((id) => id !== speaker.person_id))} />{name}<span className="ml-auto text-xs text-muted-foreground">{speaker.email}</span></label>;
              })}
            </div>
          </div>
        </div>
      </DrawerForm>
    </>
  );
}
