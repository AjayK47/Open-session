import { useEffect } from "react";

/**
 * Sets the document title (and optionally the meta description) for pages
 * that are genuinely public and shareable — the public CFP form, and the
 * embeddable public widgets. index.html's static tags only cover the
 * marketing root; without this every one of these pages showed "Open
 * Session" in the browser tab and in link previews regardless of which
 * event or which page it actually was.
 *
 * Plain DOM mutation restored on unmount, not a dependency like
 * react-helmet — this app has no SSR, so there's nothing a heavier
 * solution would buy here that a two-line effect doesn't already do.
 */
export function usePageMeta(title: string | undefined, description?: string | null) {
  useEffect(() => {
    if (!title) return;
    const previousTitle = document.title;
    document.title = title;

    const meta = description ? document.querySelector<HTMLMetaElement>('meta[name="description"]') : null;
    const previousDescription = meta?.getAttribute("content") ?? null;
    if (meta && description) meta.setAttribute("content", description);

    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== null) meta.setAttribute("content", previousDescription);
    };
  }, [title, description]);
}
