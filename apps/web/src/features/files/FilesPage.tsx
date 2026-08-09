import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FolderArchive, FolderOpen, Trash2, Download, MessageSquareText, Send, X } from "lucide-react";
import { Button, Checkbox, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@opensession/ui";
import { toast } from "sonner";
import type { FileRecord } from "@opensession/schemas";
import { createColumnHelper, DataTable } from "../../components/data-table";
import { fileRequestsApi, filesApi, ApiError } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { PageHeader } from "../../layouts/organizer-shell";

const columnHelper = createColumnHelper<FileRecord>();

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesPage() {
  const { eventId } = useCurrentEvent();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);
  const [comment, setComment] = useState("");
  const [scope, setScope] = useState("all");
  const [deliverableStatus, setDeliverableStatus] = useState("all");
  const [requestFilter, setRequestFilter] = useState("all");
  const [selectedDeliverables, setSelectedDeliverables] = useState<Set<string>>(new Set());
  const { data = [], isLoading } = useQuery({ queryKey: ["files", eventId], queryFn: () => filesApi.list(eventId) });
  const { data: requests = [] } = useQuery({ queryKey: ["file-requests", eventId], queryFn: () => fileRequestsApi.list(eventId) });

  const remove = useMutation({
    mutationFn: (fileId: string) => filesApi.remove(fileId),
    onSuccess: () => {
      toast.success("File deleted");
      void queryClient.invalidateQueries({ queryKey: ["files", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not delete file"),
  });
  const { data: versions = [] } = useQuery({
    queryKey: ["files", selectedFile?.id, "versions"],
    queryFn: () => filesApi.versions(selectedFile!.id),
    enabled: Boolean(selectedFile),
  });
  const { data: comments = [] } = useQuery({
    queryKey: ["files", selectedFile?.id, "comments"],
    queryFn: () => filesApi.comments(selectedFile!.id),
    enabled: Boolean(selectedFile),
  });
  const addComment = useMutation({
    mutationFn: () => filesApi.addComment(selectedFile!.id, comment),
    onSuccess: () => {
      setComment("");
      void queryClient.invalidateQueries({ queryKey: ["files", selectedFile?.id, "comments"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not add comment"),
  });
  const remind = useMutation({
    mutationFn: () => fileRequestsApi.remind(eventId, [...selectedDeliverables].map((key) => { const separator = key.indexOf(":"); return { request_id: key.slice(0, separator), person_id: key.slice(separator + 1) }; })),
    onSuccess: (result) => { toast.success(`Sent ${result.sent} deliverable reminder(s)`); setSelectedDeliverables(new Set()); },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not send reminders"),
  });

  const visible = data.filter((file) => {
    if (scope === "requests") return Boolean(file.file_request_id);
    if (scope === "tasks") return Boolean(file.task_assignment_id);
    if (scope === "sessions") return Boolean(file.session_id);
    if (scope === "overdue") return Boolean(file.request_due_at && new Date(file.request_due_at).getTime() < Date.now());
    if (scope === "latest") return file.is_latest;
    return true;
  });
  const deliverables = requests.flatMap((request) => request.deliverables.map((deliverable) => ({ ...deliverable, request_id: request.id, request_title: request.title, session_title: request.session_title, due_at: request.due_at }))).filter((item) => (deliverableStatus === "all" || item.status === deliverableStatus || (deliverableStatus === "overdue" && item.overdue)) && (requestFilter === "all" || item.request_id === requestFilter));
  const columns = [
    columnHelper.accessor("filename", { header: "Filename", cell: (info) => <div><p className="font-medium">{info.getValue()}</p><p className="text-xs text-muted-foreground">Version {info.row.original.version}{info.row.original.is_latest ? " · latest" : ""}</p></div> }),
    columnHelper.accessor((row) => row.person_name || row.person_email || "—", { id: "speaker", header: "Speaker" }),
    columnHelper.accessor((row) => row.request_title || row.task_name || "—", { id: "request", header: "Task / request" }),
    columnHelper.accessor((row) => row.session_title || "—", { id: "session", header: "Session" }),
    columnHelper.accessor("request_due_at", { header: "Due", cell: (info) => info.getValue() ? new Date(info.getValue()!).toLocaleDateString() : "—" }),
    columnHelper.accessor("file_type", { header: "Type", cell: (info) => <span className="capitalize">{info.getValue().replace(/_/g, " ")}</span> }),
    columnHelper.accessor("size_bytes", { header: "Size", cell: (info) => formatBytes(info.getValue()) }),
    columnHelper.accessor("uploaded_at", { header: "Uploaded", cell: (info) => new Date(info.getValue()).toLocaleDateString() }),
    columnHelper.display({
      id: "actions",
      header: "",
      cell: (info) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" asChild>
            <a href={filesApi.downloadUrl(info.row.original.id)} download>
              <Download className="h-4 w-4 text-muted-foreground" />
            </a>
          </Button>
          <Button variant="ghost" size="icon" onClick={() => remove.mutate(info.row.original.id)}>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      ),
    }),
  ];

  return (
    <div>
      <PageHeader icon={FolderOpen} title="Files" subtitle="Headshots, slides, and supporting documents." />
      <div className="px-6 py-6">
        {requests.length > 0 && <section className="mb-6 overflow-hidden rounded-xl border border-border bg-card"><div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3"><div className="mr-auto"><h2 className="text-sm font-semibold">Deliverables</h2><p className="text-xs text-muted-foreground">Speaker readiness by request, session, deadline, and latest upload.</p></div>{selectedDeliverables.size > 0 && <Button size="sm" variant="outline" onClick={() => remind.mutate()} disabled={remind.isPending}><Send className="size-4" />Remind selected ({selectedDeliverables.size})</Button>}<Select value={deliverableStatus} onValueChange={setDeliverableStatus}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="outstanding">Outstanding</SelectItem><SelectItem value="uploaded">Uploaded</SelectItem><SelectItem value="overdue">Overdue</SelectItem></SelectContent></Select><Select value={requestFilter} onValueChange={setRequestFilter}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All requests</SelectItem>{requests.map((request) => <SelectItem key={request.id} value={request.id}>{request.title}</SelectItem>)}</SelectContent></Select></div><div className="overflow-x-auto"><table className="w-full min-w-[56rem] text-sm"><thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2.5"><Checkbox aria-label="Select all outstanding deliverables" checked={deliverables.filter((item) => item.status === "outstanding").length > 0 && deliverables.filter((item) => item.status === "outstanding").every((item) => selectedDeliverables.has(`${item.request_id}:${item.person_id}`))} onCheckedChange={(checked) => setSelectedDeliverables(checked ? new Set(deliverables.filter((item) => item.status === "outstanding").map((item) => `${item.request_id}:${item.person_id}`)) : new Set())} /></th><th className="px-4 py-2.5">Speaker</th><th className="px-4 py-2.5">Request</th><th className="px-4 py-2.5">Session</th><th className="px-4 py-2.5">Due</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Latest file</th><th className="px-4 py-2.5">Uploaded</th></tr></thead><tbody className="divide-y divide-border">{deliverables.map((item) => { const key = `${item.request_id}:${item.person_id}`; return <tr key={key}><td className="px-4 py-3"><Checkbox aria-label={`Select ${item.person_name || item.person_email} ${item.request_title}`} disabled={item.status !== "outstanding"} checked={selectedDeliverables.has(key)} onCheckedChange={(checked) => setSelectedDeliverables((current) => { const next = new Set(current); if (checked) next.add(key); else next.delete(key); return next; })} /></td><td className="px-4 py-3"><p className="font-medium">{item.person_name || item.person_email}</p><p className="text-xs text-muted-foreground">{item.person_email}</p></td><td className="px-4 py-3">{item.request_title}</td><td className="px-4 py-3 text-muted-foreground">{item.session_title || "General"}</td><td className="px-4 py-3"><span className={item.overdue ? "text-destructive" : ""}>{item.due_at ? new Date(item.due_at).toLocaleDateString() : "—"}</span></td><td className="px-4 py-3"><span className={item.status === "uploaded" ? "text-success" : item.overdue ? "text-destructive" : "text-warning"}>{item.overdue ? "overdue" : item.status}</span></td><td className="px-4 py-3">{item.file_id ? <a className="text-primary hover:underline" href={filesApi.downloadUrl(item.file_id)}>{item.filename} · v{item.version}</a> : "—"}</td><td className="px-4 py-3 text-muted-foreground">{item.uploaded_at ? new Date(item.uploaded_at).toLocaleDateString() : "—"}</td></tr>; })}</tbody></table>{deliverables.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No deliverables match these filters.</p>}</div></section>}
        <DataTable
          columns={columns}
          data={visible}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          enableSelection
          searchPlaceholder="Search files, speakers, or sessions..."
          emptyTitle="No files match this view"
          toolbarLeft={<Select value={scope} onValueChange={setScope}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All uploads</SelectItem><SelectItem value="latest">Latest versions</SelectItem><SelectItem value="requests">File requests</SelectItem><SelectItem value="tasks">Task uploads</SelectItem><SelectItem value="sessions">Session files</SelectItem><SelectItem value="overdue">Past deadline</SelectItem></SelectContent></Select>}
          toolbarRight={<div className="flex items-center gap-2"><Button variant="outline" size="sm" asChild><a href={`/app/events/${eventId}/portal-forms?tab=files`}>Create file request</a></Button><Button variant="outline" size="sm" asChild><a href={filesApi.bundleUrl(eventId)} download><FolderArchive className="size-4" />Download latest ZIP</a></Button></div>}
          bulkActions={(ids, clear) => <Button variant="outline" size="sm" asChild onClick={clear}><a href={filesApi.bundleUrl(eventId, ids)} download><FolderArchive className="size-4" />Download {ids.length} selected as ZIP</a></Button>}
          onRowClick={setSelectedFile}
        />
        {selectedFile && (
          <section className="mt-6 rounded-xl border border-border bg-card">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="text-sm font-semibold">{selectedFile.filename}</h2><p className="mt-1 text-xs text-muted-foreground">Version history and review conversation</p></div><Button variant="ghost" size="icon" onClick={() => setSelectedFile(null)}><X className="size-4" /></Button></div>
            <div className="grid divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              <div className="p-5"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Versions</h3><div className="mt-3 divide-y divide-border">{versions.map((version) => <div key={version.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">Version {version.version}{version.is_latest ? " · latest" : ""}</p><p className="text-xs text-muted-foreground">{formatBytes(version.size_bytes)} · {new Date(version.uploaded_at).toLocaleString()}</p></div><Button variant="ghost" size="icon" asChild><a href={version.download_url} download><Download className="size-4" /></a></Button></div>)}</div></div>
              <div className="p-5"><h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><MessageSquareText className="size-4" />Comments</h3><div className="mt-3 space-y-3">{comments.length === 0 ? <p className="text-sm text-muted-foreground">No comments yet.</p> : comments.map((item) => <div key={item.id} className="rounded-lg bg-secondary/50 p-3"><p className="text-sm">{item.body}</p><p className="mt-1 text-xs text-muted-foreground">{item.author_name} · {new Date(item.created_at).toLocaleString()}</p></div>)}</div><div className="mt-4 flex gap-2"><Input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add feedback for the speaker…" /><Button onClick={() => addComment.mutate()} disabled={!comment.trim() || addComment.isPending}>Comment</Button></div></div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
