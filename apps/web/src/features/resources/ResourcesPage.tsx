import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Code2, Eye, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Input, Label, Switch, Textarea, cn } from "@opensession/ui";
import type { PortalResource } from "@opensession/schemas";
import { portalResourcesApi, ApiError } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { PageHeader } from "../../layouts/organizer-shell";
import { EmptyState } from "../../components/empty-state";
import { RichTextEditor } from "../../components/rich-text-editor";

/**
 * Organizer editor for the portal's wiki/reference pages (docx §8: "Resource
 * and wiki pages within the speaker portal, including HTML embed support").
 *
 * The rich-text editor covers ordinary formatted content; the HTML/Embed mode
 * is the escape hatch for pasting a raw embed snippet (a Loom recording, a
 * Google Doc, a Figma board) — the editor's schema doesn't understand
 * arbitrary iframes, so embeds need a path that writes body_html untouched.
 */
export function ResourcesPage() {
  const { eventId } = useCurrentEvent();
  const queryClient = useQueryClient();
  const { data: resources = [], isLoading } = useQuery({
    queryKey: ["portal-resources", eventId],
    queryFn: () => portalResourcesApi.list(eventId),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = resources.find((r) => r.id === selectedId) ?? null;
  const [draft, setDraft] = useState<PortalResource | null>(null);
  const [mode, setMode] = useState<"rich" | "html">("rich");

  useEffect(() => {
    setDraft(selected);
    setMode("rich");
  }, [selected?.id]);

  const create = useMutation({
    mutationFn: () => portalResourcesApi.create(eventId, { title: "Untitled page", body_html: "" }),
    onSuccess: (resource) => {
      void queryClient.invalidateQueries({ queryKey: ["portal-resources", eventId] });
      setSelectedId(resource.id);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not create page"),
  });

  const save = useMutation({
    mutationFn: () =>
      portalResourcesApi.update(draft!.id, {
        title: draft!.title,
        body_html: draft!.body_html,
        status: draft!.status,
      }),
    onSuccess: () => {
      toast.success("Page saved");
      void queryClient.invalidateQueries({ queryKey: ["portal-resources", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save page"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => portalResourcesApi.remove(id),
    onSuccess: () => {
      setSelectedId(null);
      void queryClient.invalidateQueries({ queryKey: ["portal-resources", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not delete page"),
  });

  return (
    <div>
      <PageHeader
        icon={BookOpen}
        title="Resources"
        subtitle="Wiki-style reference pages shown to every speaker in this event's portal."
        actions={
          <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus />
            New page
          </Button>
        }
      />

      {!isLoading && resources.length === 0 ? (
        <div className="px-6 py-6">
          <EmptyState
            icon={BookOpen}
            title="No resource pages yet"
            description="Add reference material — a run-of-show, a Wi-Fi password, an embedded slide deck — that every accepted speaker can read from their portal."
            action={
              <Button size="sm" onClick={() => create.mutate()}>
                <Plus />
                New page
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-[240px_1fr] gap-6 px-6 py-6">
          <div className="space-y-1">
            {resources.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm",
                  selected?.id === r.id ? "bg-accent font-medium text-accent-foreground" : "hover:bg-secondary",
                )}
              >
                <span className="truncate">{r.title || "Untitled page"}</span>
                <Badge variant={r.status === "published" ? "default" : "muted"} className="shrink-0 text-[10px]">
                  {r.status}
                </Badge>
              </button>
            ))}
          </div>

          {draft && (
            <div className="max-w-2xl space-y-4">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Content</Label>
                  <div className="inline-flex rounded-md border border-border p-0.5">
                    <button
                      type="button"
                      onClick={() => setMode("rich")}
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs",
                        mode === "rich" ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                      )}
                    >
                      <Eye className="size-3.5" />
                      Rich text
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("html")}
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs",
                        mode === "html" ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                      )}
                    >
                      <Code2 className="size-3.5" />
                      HTML / Embed
                    </button>
                  </div>
                </div>
                {mode === "rich" ? (
                  <RichTextEditor
                    value={draft.body_html}
                    onChange={(html) => setDraft({ ...draft, body_html: html })}
                    placeholder="Write the page content…"
                  />
                ) : (
                  <>
                    <Textarea
                      value={draft.body_html}
                      onChange={(e) => setDraft({ ...draft, body_html: e.target.value })}
                      placeholder='Paste an embed snippet, e.g. <iframe src="https://..."></iframe>'
                      className="min-h-40 font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground">
                      Raw HTML, written straight to the page — this is how a Loom recording, a Google Doc, or a
                      Figma board gets embedded.
                    </p>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border pt-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="resource-published"
                    checked={draft.status === "published"}
                    onCheckedChange={(checked) => setDraft({ ...draft, status: checked ? "published" : "draft" })}
                  />
                  <Label htmlFor="resource-published" className="text-xs text-muted-foreground">
                    Visible to speakers
                  </Label>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => remove.mutate(draft.id)}
                    disabled={remove.isPending}
                  >
                    <Trash2 />
                    Delete
                  </Button>
                  <Button onClick={() => save.mutate()} disabled={save.isPending}>
                    Save page
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
