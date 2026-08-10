import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronLeft } from "lucide-react";
import { portalResourcesApi } from "../../api";
import { usePortalEvent } from "./usePortalEvent";
import { EmptyState } from "../../components/empty-state";
import { PortalPageHeader } from "./PortalPageHeader";
import { Button } from "@opensession/ui";
import { sanitizeResourceHtml } from "../../lib/sanitize-html";

/** Read-only wiki/reference pages for speakers (docx §8) — organizer-authored
 *  content, published pages only, rendered as formatted HTML. */
export function PortalResourcesPage() {
  const { event } = usePortalEvent();
  const { data: pages = [], isLoading } = useQuery({
    queryKey: ["portal-resources", "published", event?.id],
    queryFn: () => portalResourcesApi.listPublished(event!.id),
    enabled: Boolean(event),
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const open = pages.find((p) => p.id === openId) ?? null;

  if (open) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
          <ChevronLeft />
          Back to resources
        </Button>
        <article className="rounded-xl border border-border bg-card p-6">
          <h1 className="text-lg font-semibold text-foreground">{open.title}</h1>
          <div
            className="prose prose-sm mt-4 max-w-none text-foreground [&_a]:text-primary [&_iframe]:aspect-video [&_iframe]:w-full [&_iframe]:rounded-lg [&_iframe]:border [&_iframe]:border-border"
            dangerouslySetInnerHTML={{ __html: sanitizeResourceHtml(open.body_html) }}
          />
        </article>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title="Resources"
        description="Reference material from the organizers — run-of-show notes, embedded decks, and other useful links."
      />
      {!isLoading && pages.length === 0 ? (
        <EmptyState icon={BookOpen} title="No resources published yet" description="Check back closer to the event." />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {pages.map((page) => (
            <button
              key={page.id}
              onClick={() => setOpenId(page.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
            >
              <BookOpen className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{page.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
