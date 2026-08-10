import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Building2, Globe, Linkedin, Mail, Plus, Send, Tag, X } from "lucide-react";
import { Avatar, AvatarFallback, Badge, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@opensession/ui";
import { toast } from "sonner";
import { ApiError, crmApi, eventsApi } from "../../api";

/** Contact detail: cross-event profile, org-wide notes (CRM-03), tags (CRM-04),
 *  and one-click reuse on a specific event's speaker roster (CRM-10). */
export function CrmContactPage() {
  const { personId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [noteDraft, setNoteDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [targetEventId, setTargetEventId] = useState("");

  const { data: profile, isLoading } = useQuery({ queryKey: ["crm", "people", personId], queryFn: () => crmApi.profile(personId) });
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: eventsApi.list });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["crm", "people", personId] });

  const addNote = useMutation({
    mutationFn: () => crmApi.addNote(personId, noteDraft),
    onSuccess: () => { setNoteDraft(""); void invalidate(); },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not add note"),
  });

  const setTags = useMutation({
    mutationFn: (tags: string[]) => crmApi.setTags(personId, tags),
    onSuccess: () => { void invalidate(); void queryClient.invalidateQueries({ queryKey: ["crm", "people"] }); },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not update tags"),
  });

  const pushToEvent = useMutation({
    mutationFn: (eventId: string) => crmApi.pushToEvent(personId, eventId),
    onSuccess: (result) => { toast.success(`Added to ${result.event_name}'s speaker roster`); setTargetEventId(""); void invalidate(); },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not add to event"),
  });

  if (isLoading || !profile) {
    return <div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  const name = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.primary_email;
  const eventsAvailable = events.filter((event) => !profile.events.some((e) => e.event_id === event.id));

  function addTag() {
    const value = tagDraft.trim();
    if (!value || !profile) return;
    setTags.mutate([...profile.tags, value]);
    setTagDraft("");
  }

  function removeTag(tag: string) {
    if (!profile) return;
    setTags.mutate(profile.tags.filter((t) => t !== tag));
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/70 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-6">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate("/app/crm")}><ArrowLeft /></Button>
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar className="size-8"><AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
            <div><p className="truncate text-sm font-semibold">{name}</p><p className="text-[11px] text-muted-foreground">{profile.primary_email}</p></div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-4xl gap-6 px-6 py-9 lg:grid-cols-[16rem_1fr]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-5">
            <dl className="space-y-3 text-sm">
              <Row icon={Mail} label="Email" value={profile.primary_email} />
              <Row icon={Building2} label="Company" value={profile.company} />
              <Row icon={Building2} label="Title" value={profile.job_title} />
              <Row icon={Globe} label="Website" value={profile.website} href={profile.website ?? undefined} />
              <Row icon={Linkedin} label="LinkedIn" value={profile.linkedin_url} href={profile.linkedin_url ?? undefined} />
            </dl>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {profile.tags.map((tag) => (
                <Badge key={tag} variant="muted" className="gap-1">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`}><X className="size-3" /></button>
                </Badge>
              ))}
              {profile.tags.length === 0 && <span className="text-xs text-muted-foreground">No tags yet</span>}
            </div>
            <div className="mt-3 flex gap-1.5">
              <Input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} placeholder="Add a tag…" className="h-8 text-xs" />
              <Button size="icon-sm" variant="outline" onClick={addTag}><Tag className="size-3.5" /></Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add to an event</p>
            <div className="space-y-2">
              <Select value={targetEventId} onValueChange={setTargetEventId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose an event…" /></SelectTrigger>
                <SelectContent>{eventsAvailable.map((event) => <SelectItem key={event.id} value={event.id}>{event.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" className="w-full" disabled={!targetEventId || pushToEvent.isPending} onClick={() => pushToEvent.mutate(targetEventId)}>
                <Plus />{pushToEvent.isPending ? "Adding…" : "Add to speaker roster"}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <section>
            <h2 className="text-sm font-semibold">Event history</h2>
            <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
              {profile.events.length === 0 && <p className="p-4 text-sm text-muted-foreground">Not on any event's roster yet.</p>}
              {profile.events.map((event) => (
                <Link key={event.event_id} to={`/app/events/${event.event_id}/speakers/${personId}`} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-secondary/60">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{event.event_name}</span>
                  <Badge variant="muted" className="capitalize">{event.speaker_status}</Badge>
                  <Badge variant="muted" className="capitalize">{event.confirmation_status}</Badge>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold">Notes</h2>
            <div className="mt-3 flex gap-2">
              <Textarea rows={3} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Internal note — visible to your team only" />
              <Button className="self-end" disabled={!noteDraft.trim() || addNote.isPending} onClick={() => addNote.mutate()}><Send /></Button>
            </div>
            <div className="mt-4 space-y-3">
              {profile.notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
              {profile.notes.map((note) => (
                <div key={note.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                  <p className="whitespace-pre-wrap">{note.body}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{note.author_name} · {new Date(note.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Row({ icon: Icon, label, value, href }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | null; href?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-[11px] text-muted-foreground">{label}</dt>
        <dd className="truncate">{value ? (href ? <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">{value}</a> : value) : "—"}</dd>
      </div>
    </div>
  );
}
