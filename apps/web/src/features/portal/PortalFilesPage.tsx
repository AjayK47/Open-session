import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileUp, FolderOpen, MessageSquareText, UploadCloud, X } from "lucide-react";
import type { FileRequest } from "@opensession/schemas";
import { Button, cn } from "@opensession/ui";
import { toast } from "sonner";
import { fileRequestsApi, filesApi, meApi } from "../../api";
import { usePortalEvent } from "./usePortalEvent";
import { EmptyState } from "../../components/empty-state";
import { PortalPageHeader } from "./PortalPageHeader";

export function PortalFilesPage() {
  const { event } = usePortalEvent();
  const queryClient = useQueryClient();
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const { data: files = [], isLoading } = useQuery({ queryKey: ["me", "files"], queryFn: meApi.files });
  const { data: requests = [] } = useQuery({ queryKey: ["me", "file-requests"], queryFn: fileRequestsApi.mine });
  const { data: versions = [] } = useQuery({ queryKey: ["files", selectedFileId, "versions"], queryFn: () => filesApi.versions(selectedFileId!), enabled: Boolean(selectedFileId) });
  const { data: comments = [] } = useQuery({ queryKey: ["files", selectedFileId, "comments"], queryFn: () => filesApi.comments(selectedFileId!), enabled: Boolean(selectedFileId) });
  const addComment = useMutation({ mutationFn: () => filesApi.addComment(selectedFileId!, comment), onSuccess: () => { setComment(""); void queryClient.invalidateQueries({ queryKey: ["files", selectedFileId, "comments"] }); }, onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add comment") });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["me", "files"] });
    void queryClient.invalidateQueries({ queryKey: ["me", "file-requests"] });
  };

  return (
    <div className="space-y-8">
      <PortalPageHeader title="Files" description="Complete organizer requests and keep your latest speaker materials in one place." />

      {event && requests.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between"><div><h2 className="text-sm font-semibold text-foreground">Requested from you</h2><p className="text-xs text-muted-foreground">Each request shows its deadline and upload rules.</p></div><span className="text-xs text-muted-foreground">{requests.length} request(s)</span></div>
          <div className="grid gap-3 lg:grid-cols-2">
            {requests.map((request) => {
              const uploaded = files.filter((file) => file.file_request_id === request.id);
              return <RequestCard key={request.id} request={request} eventId={event.id} uploaded={uploaded.length} onUploaded={refresh} />;
            })}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3"><h2 className="text-sm font-semibold text-foreground">Your file library</h2><p className="text-xs text-muted-foreground">All slides, headshots, and supporting documents you have uploaded.</p></div>
        {!isLoading && files.length === 0 ? <EmptyState icon={FolderOpen} title="No files uploaded yet" /> : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {files.map((file) => (
              <div key={file.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{file.filename}</p><p className="text-xs capitalize text-muted-foreground">{file.file_type.replace(/_/g, " ")}{file.version > 1 ? ` · version ${file.version}` : ""}</p></div>
                <div className="flex gap-1"><Button variant="ghost" size="icon-sm" aria-label={`Review ${file.filename}`} onClick={() => setSelectedFileId(file.id)}><MessageSquareText /></Button><Button variant="ghost" size="icon-sm" asChild aria-label={`Download ${file.filename}`}><a href={filesApi.downloadUrl(file.id)} download><Download /></a></Button></div>
              </div>
            ))}
          </div>
        )}
      </section>
      {selectedFileId && <section className="rounded-xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border px-4 py-3"><div><h2 className="text-sm font-semibold">Versions and feedback</h2><p className="text-xs text-muted-foreground">Organizer comments appear here and your replies are shared back.</p></div><Button variant="ghost" size="icon-sm" onClick={() => setSelectedFileId(null)}><X /></Button></div><div className="grid divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0"><div className="p-4"><h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Version history</h3><div className="mt-2 divide-y divide-border">{versions.map((version) => <div key={version.id} className="flex items-center justify-between py-2.5"><div><p className="text-sm">Version {version.version}{version.is_latest ? " · latest" : ""}</p><p className="text-xs text-muted-foreground">{new Date(version.uploaded_at).toLocaleString()}</p></div><Button variant="ghost" size="icon-sm" asChild><a href={version.download_url} download><Download /></a></Button></div>)}</div></div><div className="p-4"><h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Conversation</h3><div className="mt-2 space-y-2">{comments.length === 0 ? <p className="text-sm text-muted-foreground">No comments yet.</p> : comments.map((item) => <div key={item.id} className="rounded-lg bg-muted/50 p-3"><p className="text-sm">{item.body}</p><p className="mt-1 text-xs text-muted-foreground">{item.author_name} · {new Date(item.created_at).toLocaleString()}</p></div>)}</div><div className="mt-3 flex gap-2"><input className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Reply to organizers…" /><Button size="sm" onClick={() => addComment.mutate()} disabled={!comment.trim() || addComment.isPending}>Reply</Button></div></div></div></section>}
    </div>
  );
}

function RequestCard({ request, eventId, uploaded, onUploaded }: { request: FileRequest; eventId: string; uploaded: number; onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const instructions = (request.instructions_html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const overdue = request.due_at ? new Date(request.due_at).getTime() < Date.now() && uploaded === 0 : false;

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      const fileType = ["ppt", "pptx", "odp", "key"].includes(extension) ? "slides" : "supporting";
      const intent = await fileRequestsApi.uploadIntent(request.id, {
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        file_type: fileType,
        file_request_id: request.id,
        session_id: request.session_id,
      });
      await filesApi.uploadContent(intent.id, file);
      toast.success(uploaded ? "New version uploaded" : "Request completed");
      onUploaded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <article className={cn("rounded-xl border bg-card p-4", overdue ? "border-destructive/40" : "border-border")}>
      <div className="flex items-start gap-3"><div className={cn("mt-0.5 rounded-lg p-2", uploaded ? "bg-success/10 text-success" : "bg-accent text-primary")}>{uploaded ? <CheckCircle2 className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><h3 className="text-sm font-medium text-foreground">{request.title}</h3>{instructions && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{instructions}</p>}</div></div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-xs"><div><dt className="text-muted-foreground">Deadline</dt><dd className={cn("mt-0.5 font-medium", overdue ? "text-destructive" : "text-foreground")}>{request.due_at ? new Date(request.due_at).toLocaleDateString() : "No deadline"}</dd></div><div><dt className="text-muted-foreground">Session</dt><dd className="mt-0.5 truncate font-medium text-foreground">{request.session_title || "General"}</dd></div><div><dt className="text-muted-foreground">Accepted</dt><dd className="mt-0.5 font-medium text-foreground">{request.accepted_extensions.map((item) => `.${item}`).join(", ") || "Standard documents"}</dd></div><div><dt className="text-muted-foreground">Maximum</dt><dd className="mt-0.5 font-medium text-foreground">{request.max_size_mb} MB</dd></div></dl>
      <input ref={input} className="hidden" type="file" accept={request.accepted_extensions.map((item) => `.${item}`).join(",")} onChange={(event) => void upload(event.target.files?.[0])} />
      <Button className="mt-4 w-full" variant={uploaded ? "outline" : "default"} size="sm" disabled={busy} onClick={() => input.current?.click()}><UploadCloud className="h-4 w-4" />{busy ? "Uploading…" : uploaded ? "Upload replacement" : "Choose file"}</Button>
    </article>
  );
}
