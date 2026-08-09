import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Mail, Plus, Upload, Users } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@opensession/ui";
import type { EmailTemplate, Speaker, SpeakerCreateInput } from "@opensession/schemas";
import { toast } from "sonner";
import { createColumnHelper, DataTable } from "../../components/data-table";
import { ApiError, communicationsApi, filesApi, speakersApi } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { PageHeader } from "../../layouts/organizer-shell";
import { StatusPill } from "../../components/status-pill";
import { sanitizeHtml } from "../../lib/sanitize-html";

const columnHelper = createColumnHelper<Speaker>();
const EMPTY_SPEAKER: SpeakerCreateInput = {
  email: "",
  first_name: "",
  last_name: "",
  company: "",
  job_title: "",
  bio: "",
  website: "",
  linkedin_url: "",
  x_url: "",
  speaker_status: "invited",
  confirmation_status: "unconfirmed",
};

export function SpeakersListPage() {
  const { eventId } = useCurrentEvent();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const importRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("all");
  const [confirmation, setConfirmation] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState<SpeakerCreateInput>(EMPTY_SPEAKER);
  const [message, setMessage] = useState({ subject: "A note from the event team", html: "<p>Hi {{speaker.first_name}},</p><p></p>" });
  const [templateId, setTemplateId] = useState("");

  const { data: speakers = [], isLoading } = useQuery({
    queryKey: ["speakers", eventId, status, confirmation],
    queryFn: () => speakersApi.list(eventId, status === "all" ? undefined : status, confirmation === "all" ? undefined : confirmation),
  });
  const { data: templates = [] } = useQuery({ queryKey: ["email-templates", eventId], queryFn: () => communicationsApi.listTemplates(eventId) });
  const selectedTemplate = templates.find((template) => template.id === templateId);
  const emailInput = { subject: selectedTemplate?.subject_template ?? message.subject, html: selectedTemplate?.html_template ?? message.html, recipients: selectedEmails };
  const { data: preview, isFetching: previewing } = useQuery({
    queryKey: ["communications-preview", eventId, emailInput.subject, emailInput.html, selectedEmails[0]],
    queryFn: () => communicationsApi.previewManual(eventId, emailInput),
    enabled: emailOpen && selectedEmails.length > 0 && Boolean(emailInput.subject && emailInput.html),
  });

  const create = useMutation({
    mutationFn: () => speakersApi.create(eventId, draft),
    onSuccess: () => {
      toast.success("Speaker added");
      setAddOpen(false);
      setDraft(EMPTY_SPEAKER);
      void queryClient.invalidateQueries({ queryKey: ["speakers", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not add speaker"),
  });

  const importCsv = useMutation({
    mutationFn: (file: File) => speakersApi.importCsv(eventId, file),
    onSuccess: (result) => {
      const failures = result.errors.length ? ` · ${result.errors.length} row error(s)` : "";
      toast.success(`${result.created} created · ${result.updated} updated${failures}`);
      void queryClient.invalidateQueries({ queryKey: ["speakers", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not import CSV"),
  });

  const bulkEmail = useMutation({
    mutationFn: () => communicationsApi.sendManual(eventId, { ...emailInput, template_id: templateId || undefined }),
    onSuccess: (result) => {
      toast.success(`Sent ${result.sent} email(s)`);
      setEmailOpen(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not send email"),
  });

  const columns = [
    columnHelper.accessor((row) => `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || row.email, {
      id: "name",
      header: "Name",
      cell: (info) => (
        <div className="flex items-center gap-2">
          <Avatar className="size-7">
            {info.row.original.headshot_file_id && <AvatarImage src={filesApi.downloadUrl(info.row.original.headshot_file_id)} alt="" />}
            <AvatarFallback className="text-[10px]">{info.getValue().slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-foreground">{info.getValue()}</p>
            <p className="text-xs text-muted-foreground">{info.row.original.email}</p>
          </div>
        </div>
      ),
    }),
    columnHelper.accessor("company", { header: "Company / title", cell: (info) => `${info.getValue() ?? ""}${info.row.original.job_title ? ` · ${info.row.original.job_title}` : ""}` || "—" }),
    columnHelper.accessor("speaker_status", { header: "Workflow", cell: (info) => <StatusPill label={info.getValue()} tone={info.getValue() === "accepted" ? "positive" : "neutral"} /> }),
    columnHelper.accessor("confirmation_status", { header: "Confirmation", cell: (info) => <StatusPill label={info.getValue()} tone={info.getValue() === "confirmed" ? "positive" : "attention"} /> }),
    columnHelper.accessor("profile_completion_percent", { header: "Profile", cell: (info) => `${info.getValue()}%` }),
    columnHelper.accessor("outstanding_tasks", { header: "Outstanding", cell: (info) => info.getValue() > 0 ? <span className="text-warning">{info.getValue()}</span> : <span className="text-muted-foreground">0</span> }),
  ];

  function setField<K extends keyof SpeakerCreateInput>(key: K, value: SpeakerCreateInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div>
      <PageHeader icon={Users} title="Speakers" subtitle="Manage the roster, invitations, profiles, and onboarding status." />
      <div className="px-6 py-6">
        <DataTable
          savedViews={{ eventId, resourceType: "speakers" }}
          columns={columns}
          data={speakers}
          getRowId={(row) => row.person_id}
          isLoading={isLoading}
          searchPlaceholder="Search speakers..."
          enableSelection
          ownsStatusFilter
          toolbarLeft={(<div className="flex flex-wrap gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All workflow states</SelectItem>
                <SelectItem value="invited">Invited</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
              </SelectContent>
            </Select>
            <Select value={confirmation} onValueChange={setConfirmation}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All confirmations</SelectItem><SelectItem value="confirmed">Confirmed</SelectItem><SelectItem value="unconfirmed">Unconfirmed</SelectItem><SelectItem value="declined">Declined</SelectItem></SelectContent></Select>
          </div>)}
          toolbarRight={(
            <div className="flex items-center gap-2">
              <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) importCsv.mutate(file); event.target.value = ""; }} />
              <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} disabled={importCsv.isPending}><Upload className="h-4 w-4" />Import CSV</Button>
              <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" />Add speaker</Button>
            </div>
          )}
          bulkActions={(ids, clear) => (
            <Button size="sm" variant="outline" onClick={() => { setSelectedEmails(speakers.filter((speaker) => ids.includes(speaker.person_id)).map((speaker) => speaker.email)); setEmailOpen(true); clear(); }}>
              <Mail className="h-4 w-4" />Email selected
            </Button>
          )}
          onRowClick={(row) => navigate(`/app/events/${eventId}/speakers/${row.person_id}`)}
          emptyTitle="No speakers yet"
          emptyDescription="Add one person or import a CSV roster to get started."
        />
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Add speaker</DialogTitle><DialogDescription>Create their organizer record and speaker portal access.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <Field label="Email" required><Input type="email" value={draft.email} onChange={(e) => setField("email", e.target.value)} /></Field>
            <Field label="Workflow status"><Select value={draft.speaker_status} onValueChange={(v) => setField("speaker_status", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="invited">Invited</SelectItem><SelectItem value="accepted">Accepted</SelectItem><SelectItem value="declined">Declined</SelectItem></SelectContent></Select></Field>
            <Field label="First name"><Input value={draft.first_name ?? ""} onChange={(e) => setField("first_name", e.target.value)} /></Field>
            <Field label="Last name"><Input value={draft.last_name ?? ""} onChange={(e) => setField("last_name", e.target.value)} /></Field>
            <Field label="Company"><Input value={draft.company ?? ""} onChange={(e) => setField("company", e.target.value)} /></Field>
            <Field label="Job title"><Input value={draft.job_title ?? ""} onChange={(e) => setField("job_title", e.target.value)} /></Field>
            <Field label="Website"><Input value={draft.website ?? ""} onChange={(e) => setField("website", e.target.value)} /></Field>
            <Field label="LinkedIn"><Input value={draft.linkedin_url ?? ""} onChange={(e) => setField("linkedin_url", e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="Bio"><Textarea rows={5} value={draft.bio ?? ""} onChange={(e) => setField("bio", e.target.value)} /></Field></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button><Button onClick={() => create.mutate()} disabled={!draft.email || create.isPending}>{create.isPending ? "Adding…" : "Add speaker"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Email {selectedEmails.length} speaker(s)</DialogTitle><DialogDescription>This message is sent through the configured provider and recorded in communication history.</DialogDescription></DialogHeader>
          <Field label="Template"><Select value={templateId || "custom"} onValueChange={(value) => setTemplateId(value === "custom" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="custom">Custom message</SelectItem>{templates.map((template: EmailTemplate) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Tokenized subject"><Input value={emailInput.subject} disabled={Boolean(selectedTemplate)} onChange={(e) => setMessage((v) => ({ ...v, subject: e.target.value }))} /></Field>
          <Field label="Tokenized HTML"><Textarea rows={7} value={emailInput.html} disabled={Boolean(selectedTemplate)} onChange={(e) => setMessage((v) => ({ ...v, html: e.target.value }))} /></Field>
          <p className="text-xs text-muted-foreground">Merge fields: {"{{speaker.first_name}}"}, {"{{speaker.last_name}}"}, {"{{speaker.name}}"}, {"{{speaker.email}}"}, {"{{event.name}}"}, and {"{{portal_url}}"}.</p>
          <div className="rounded-lg border border-border bg-secondary/30 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resolved preview {preview ? `for ${preview.recipient_name}` : ""}</p>{previewing && !preview ? <p className="mt-2 text-sm text-muted-foreground">Resolving preview…</p> : preview ? <><p className="mt-2 text-sm font-semibold">{preview.subject}</p><div className="prose prose-sm mt-2 max-w-none text-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(preview.html) }} /></> : null}</div>
          <DialogFooter><Button variant="outline" onClick={() => setEmailOpen(false)}>Cancel</Button><Button onClick={() => bulkEmail.mutate()} disabled={!emailInput.subject || !emailInput.html || bulkEmail.isPending}>{bulkEmail.isPending ? "Sending…" : `Send to ${selectedEmails.length}`}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}{required ? " *" : ""}</Label>{children}</div>;
}
