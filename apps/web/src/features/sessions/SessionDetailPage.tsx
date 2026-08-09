import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, History, RotateCcw, Save } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import type { ParticipantInput } from "@opensession/schemas";
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@opensession/ui";
import { toast } from "sonner";
import { ApiError, programApi, sessionsApi } from "../../api";
import { ParticipantListEditor } from "../../components/participant-list-editor";
import { StatusPill, SESSION_STATUS_TONE } from "../../components/status-pill";
import { useCurrentEvent } from "../../lib/current-event";

export function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { eventId } = useCurrentEvent();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [status, setStatus] = useState("draft");
  const [trackId, setTrackId] = useState("");
  const [formatId, setFormatId] = useState("");
  const [language, setLanguage] = useState("");
  const [location, setLocation] = useState("");
  const [participants, setParticipants] = useState<ParticipantInput[]>([]);

  const { data: session } = useQuery({ queryKey: ["sessions", "detail", sessionId], queryFn: () => sessionsApi.get(sessionId!), enabled: Boolean(sessionId) });
  const { data: revisions = [] } = useQuery({ queryKey: ["sessions", sessionId, "revisions"], queryFn: () => sessionsApi.revisions(sessionId!), enabled: Boolean(sessionId) });
  const { data: tracks = [] } = useQuery({ queryKey: ["tracks", eventId], queryFn: () => programApi.tracks.list(eventId) });
  const { data: formats = [] } = useQuery({ queryKey: ["formats", eventId], queryFn: () => programApi.formats.list(eventId) });

  useEffect(() => {
    if (!session) return;
    setTitle(session.title);
    setDescription(session.description ?? "");
    setApprovalStatus(session.approval_status as typeof approvalStatus);
    setStatus(session.status);
    setTrackId(session.track_id ?? "");
    setFormatId(session.format_id ?? "");
    setLanguage(session.language ?? "");
    setLocation(session.location ?? "");
    setParticipants(session.participants.map((person) => ({ email: person.email, role: person.role, first_name: person.first_name, last_name: person.last_name })));
  }, [session]);

  const save = useMutation({
    mutationFn: () => sessionsApi.update(sessionId!, { title, description, approval_status: approvalStatus, status, track_id: trackId || null, format_id: formatId || null, language: language || null, location: location || null, participants }),
    onSuccess: () => { toast.success("Session saved"); void queryClient.invalidateQueries({ queryKey: ["sessions"] }); },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save session"),
  });
  const restore = useMutation({
    mutationFn: (revisionId: string) => sessionsApi.restoreRevision(sessionId!, revisionId),
    onSuccess: () => { toast.success("Revision restored"); void queryClient.invalidateQueries({ queryKey: ["sessions"] }); },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not restore revision"),
  });

  if (!session) return <div className="p-6 text-sm text-muted-foreground">Loading session…</div>;

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <button onClick={() => navigate(`/app/events/${eventId}/sessions`)} className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Back to sessions</button>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">Edit session</h1><p className="mt-1 text-sm text-muted-foreground">Approved content is eligible for the public program.</p></div><StatusPill label={session.status} tone={SESSION_STATUS_TONE[session.status] ?? "neutral"} /></div>
          <section className="space-y-5 rounded-xl border border-border bg-card p-5">
            <Field label="Title"><Input value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
            <Field label="Abstract / description"><Textarea rows={10} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Track"><Select value={trackId || "none"} onValueChange={(value) => setTrackId(value === "none" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No track</SelectItem>{tracks.map((track) => <SelectItem key={track.id} value={track.id}>{track.name}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Format"><Select value={formatId || "none"} onValueChange={(value) => setFormatId(value === "none" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No format</SelectItem>{formats.map((format) => <SelectItem key={format.id} value={format.id}>{format.name}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Language"><Input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="English" /></Field>
              <Field label="Location override"><Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Room or online URL" /></Field>
              <Field label="Content approval"><Select value={approvalStatus} onValueChange={(value) => setApprovalStatus(value as typeof approvalStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending review</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="rejected">Changes required</SelectItem></SelectContent></Select></Field>
              <Field label="Session status"><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["draft", "confirmed", "scheduled", "published", "cancelled"].map((value) => <SelectItem key={value} value={value}>{value.replace("_", " ")}</SelectItem>)}</SelectContent></Select></Field>
            </div>
            <div className="space-y-2"><Label>Participants and roles</Label><ParticipantListEditor value={participants} onChange={setParticipants} roles={["speaker", "co-speaker", "moderator", "panelist"]} /></div>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !title.trim()}><Save className="size-4" />{save.isPending ? "Saving…" : "Save changes"}</Button>
          </section>
        </main>
        <aside><section className="sticky top-24 rounded-xl border border-border bg-card"><div className="flex items-center gap-2 border-b border-border px-4 py-3"><History className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Revision history</h2></div><div className="divide-y divide-border">{revisions.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No edits recorded yet.</p> : revisions.map((revision) => <div key={revision.id} className="space-y-2 p-4"><div><p className="text-xs font-medium">{revision.changed_fields.join(", ")}</p><p className="mt-0.5 text-xs text-muted-foreground">{revision.editor_name} · {new Date(revision.created_at).toLocaleString()}</p></div><Button variant="ghost" size="sm" onClick={() => restore.mutate(revision.id)} disabled={restore.isPending}><RotateCcw className="size-3.5" />Restore</Button></div>)}</div></section></aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
