import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, CalendarDays, ExternalLink, ListPlus, Save, Send } from "lucide-react";
import type { SpeakerOrganizerUpdateInput } from "@opensession/schemas";
import { Avatar, AvatarFallback, AvatarImage, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Progress, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from "@opensession/ui";
import { toast } from "sonner";
import { ApiError, filesApi, speakersApi, tasksApi } from "../../api";
import { FileUploader } from "../../components/file-uploader";
import { useCurrentEvent } from "../../lib/current-event";
import { StatusPill, TASK_STATUS_TONE } from "../../components/status-pill";

export function SpeakerDetailPage() {
  const { speakerId } = useParams<{ speakerId: string }>();
  const { eventId } = useCurrentEvent();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTemplateId, setTaskTemplateId] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [draft, setDraft] = useState<SpeakerOrganizerUpdateInput>({});
  const { data: speaker, isLoading } = useQuery({ queryKey: ["speakers", "detail", eventId, speakerId], queryFn: () => speakersApi.get(eventId, speakerId!), enabled: Boolean(eventId && speakerId) });
  const { data: taskTemplates = [] } = useQuery({ queryKey: ["task-templates", eventId], queryFn: () => tasksApi.listTemplates(eventId) });

  useEffect(() => {
    if (!speaker) return;
    setDraft({
      first_name: speaker.first_name ?? "", last_name: speaker.last_name ?? "", company: speaker.company ?? "",
      job_title: speaker.job_title ?? "", bio: speaker.bio ?? "", phone: speaker.phone ?? "", website: speaker.website ?? "",
      linkedin_url: speaker.linkedin_url ?? "", x_url: speaker.x_url ?? "", speaker_status: speaker.speaker_status,
      confirmation_status: speaker.confirmation_status, custom_fields: speaker.custom_fields,
    });
  }, [speaker]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["speakers", "detail", eventId, speakerId] });
    void queryClient.invalidateQueries({ queryKey: ["speakers", eventId] });
  };
  const save = useMutation({ mutationFn: () => speakersApi.organizerUpdate(eventId, speakerId!, draft), onSuccess: () => { toast.success("Speaker profile saved"); setEditing(false); refresh(); }, onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save profile") });
  const invite = useMutation({ mutationFn: () => speakersApi.invite(eventId, speakerId!), onSuccess: () => toast.success("Portal invitation sent and logged"), onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not send invitation") });
  const assignTask = useMutation({ mutationFn: () => tasksApi.assignTemplate(eventId, taskTemplateId, [speakerId!], taskDueAt ? new Date(`${taskDueAt}T23:59:00`).toISOString() : undefined), onSuccess: (result) => { toast.success(result.created ? "Task assigned" : "This task is already assigned"); setTaskOpen(false); refresh(); }, onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not assign task") });

  if (isLoading || !speaker) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  const name = [speaker.first_name, speaker.last_name].filter(Boolean).join(" ") || speaker.email;
  const field = <K extends keyof SpeakerOrganizerUpdateInput>(key: K, value: SpeakerOrganizerUpdateInput[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const logistics = (draft.custom_fields ?? {}) as Record<string, unknown>;

  return (
    <div>
      <div className="border-b border-border px-6 py-5">
        <button onClick={() => navigate(`/app/events/${eventId}/speakers`)} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Back to speakers</button>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar className="size-14">{speaker.headshot_file_id && <AvatarImage src={filesApi.downloadUrl(speaker.headshot_file_id)} alt="" />}<AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
          <div className="min-w-48 flex-1"><h1 className="text-xl font-semibold text-foreground">{name}</h1><p className="text-sm text-muted-foreground">{speaker.job_title}{speaker.job_title && speaker.company ? " at " : ""}{speaker.company}</p><div className="mt-1.5 flex items-center gap-2"><Progress value={speaker.profile_completion_percent} className="w-32" /><span className="text-xs text-muted-foreground">{speaker.profile_completion_percent}% complete</span></div></div>
          <Button variant="outline" size="sm" onClick={() => invite.mutate()} disabled={invite.isPending}><Send className="h-4 w-4" />{invite.isPending ? "Sending…" : "Send portal invite"}</Button>
          <Button variant="outline" size="sm" onClick={() => setTaskOpen(true)}><ListPlus className="h-4 w-4" />Assign task</Button>
          <Button size="sm" onClick={() => editing ? save.mutate() : setEditing(true)} disabled={save.isPending}>{editing ? <Save className="h-4 w-4" /> : null}{editing ? "Save changes" : "Edit profile"}</Button>
        </div>
      </div>

      <div className="px-6 py-6">
        <Tabs defaultValue="profile">
          <TabsList><TabsTrigger value="profile">Profile</TabsTrigger><TabsTrigger value="sessions">Sessions</TabsTrigger><TabsTrigger value="tasks">Tasks</TabsTrigger><TabsTrigger value="files">Files</TabsTrigger></TabsList>
          <TabsContent value="profile" className="mt-4">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <section className="rounded-xl border border-border bg-card p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="First name"><Input disabled={!editing} value={draft.first_name ?? ""} onChange={(e) => field("first_name", e.target.value)} /></Field>
                  <Field label="Last name"><Input disabled={!editing} value={draft.last_name ?? ""} onChange={(e) => field("last_name", e.target.value)} /></Field>
                  <Field label="Email"><Input disabled value={speaker.email} /></Field>
                  <Field label="Phone"><Input disabled={!editing} value={draft.phone ?? ""} onChange={(e) => field("phone", e.target.value)} /></Field>
                  <Field label="Company"><Input disabled={!editing} value={draft.company ?? ""} onChange={(e) => field("company", e.target.value)} /></Field>
                  <Field label="Job title"><Input disabled={!editing} value={draft.job_title ?? ""} onChange={(e) => field("job_title", e.target.value)} /></Field>
                  <div className="sm:col-span-2"><Field label="Biography"><Textarea disabled={!editing} rows={6} value={draft.bio ?? ""} onChange={(e) => field("bio", e.target.value)} /></Field></div>
                  <Field label="Website"><Input disabled={!editing} value={draft.website ?? ""} onChange={(e) => field("website", e.target.value)} /></Field>
                  <Field label="LinkedIn"><Input disabled={!editing} value={draft.linkedin_url ?? ""} onChange={(e) => field("linkedin_url", e.target.value)} /></Field>
                  <Field label="X / Twitter"><Input disabled={!editing} value={draft.x_url ?? ""} onChange={(e) => field("x_url", e.target.value)} /></Field>
                  <Field label="Workflow status"><Select disabled={!editing} value={draft.speaker_status ?? "invited"} onValueChange={(v) => field("speaker_status", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="invited">Invited</SelectItem><SelectItem value="accepted">Accepted</SelectItem><SelectItem value="declined">Declined</SelectItem></SelectContent></Select></Field>
                  <Field label="Confirmation"><Select disabled={!editing} value={draft.confirmation_status ?? "unconfirmed"} onValueChange={(v) => field("confirmation_status", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unconfirmed">Unconfirmed</SelectItem><SelectItem value="confirmed">Confirmed</SelectItem><SelectItem value="declined">Declined</SelectItem></SelectContent></Select></Field>
                </div>
              </section>
              <aside className="space-y-4">
                <section className="rounded-xl border border-border bg-card p-4"><h2 className="mb-3 text-sm font-medium">Headshot</h2><FileUploader eventId={eventId} fileType="headshot" refs={{ person_id: speaker.person_id }} accept="image/*" label="Upload a new headshot" onUploaded={refresh} /></section>
                <section className="rounded-xl border border-border bg-card p-4"><h2 className="mb-3 text-sm font-medium">Logistics</h2><div className="space-y-3"><Field label="Dietary requirements"><Input disabled={!editing} value={String(logistics.dietary_requirements ?? "")} onChange={(e) => field("custom_fields", { ...logistics, dietary_requirements: e.target.value })} /></Field><Field label="Travel dates"><Input disabled={!editing} value={String(logistics.travel_dates ?? "")} onChange={(e) => field("custom_fields", { ...logistics, travel_dates: e.target.value })} /></Field><Field label="Accessibility / notes"><Textarea disabled={!editing} rows={3} value={String(logistics.organizer_notes ?? "")} onChange={(e) => field("custom_fields", { ...logistics, organizer_notes: e.target.value })} /></Field></div></section>
              </aside>
            </div>
          </TabsContent>

          <TabsContent value="sessions" className="mt-4 space-y-2">{speaker.sessions.length === 0 ? <p className="text-sm text-muted-foreground">No sessions yet.</p> : speaker.sessions.map((session) => <button key={session.id} onClick={() => navigate(`/app/events/${eventId}/sessions/${session.id}`)} className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left hover:bg-muted/40"><div><p className="text-sm font-medium text-foreground">{session.title}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{session.starts_at ? new Date(session.starts_at).toLocaleString() : "Not scheduled"}{session.room_name ? ` · ${session.room_name}` : ""}</p></div><StatusPill label={session.status} tone={session.status === "scheduled" || session.status === "published" ? "positive" : "neutral"} /></button>)}</TabsContent>
          <TabsContent value="tasks" className="mt-4 space-y-2">{speaker.tasks.length === 0 ? <p className="text-sm text-muted-foreground">No tasks assigned.</p> : speaker.tasks.map((task) => <div key={task.id} className="flex items-center justify-between rounded-lg border border-border p-3"><div><p className="text-sm font-medium text-foreground">{task.name}</p>{task.due_at && <p className="text-xs text-muted-foreground">Due {new Date(task.due_at).toLocaleDateString()}</p>}</div><StatusPill label={task.status} tone={TASK_STATUS_TONE[task.status] ?? "neutral"} /></div>)}</TabsContent>
          <TabsContent value="files" className="mt-4 space-y-2">{speaker.files.length === 0 ? <p className="text-sm text-muted-foreground">No files uploaded.</p> : speaker.files.map((file) => <a key={file.id} href={filesApi.downloadUrl(file.id)} className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/40"><div><p className="text-sm text-foreground">{file.filename}</p><span className="text-xs capitalize text-muted-foreground">{file.file_type}</span></div><ExternalLink className="h-4 w-4 text-muted-foreground" /></a>)}</TabsContent>
        </Tabs>
      </div>

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Assign a task</DialogTitle><DialogDescription>Select one onboarding request and an optional explicit deadline.</DialogDescription></DialogHeader>
          <Field label="Task template"><Select value={taskTemplateId} onValueChange={setTaskTemplateId}><SelectTrigger><SelectValue placeholder="Choose a task" /></SelectTrigger><SelectContent>{taskTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Due date"><Input type="date" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} /></Field>
          <DialogFooter><Button variant="outline" onClick={() => setTaskOpen(false)}>Cancel</Button><Button onClick={() => assignTask.mutate()} disabled={!taskTemplateId || assignTask.isPending}>{assignTask.isPending ? "Assigning…" : "Assign task"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
