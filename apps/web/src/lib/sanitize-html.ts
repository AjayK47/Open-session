import DOMPurify from "dompurify";

/** Sanitize user-authored rich text at the final render boundary. */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "iframe", "object", "embed"],
    FORBID_ATTR: ["style"],
  });
}

const RESOURCE_EMBED_HOSTS = [
  "youtube.com",
  "youtube-nocookie.com",
  "youtu.be",
  "vimeo.com",
  "loom.com",
  "google.com",
  "figma.com",
  "canva.com",
  "slides.com",
  "speakerdeck.com",
];

function isApprovedEmbedUrl(value: string): boolean {
  if (!value.startsWith("https://")) return false;

  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return RESOURCE_EMBED_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/**
 * Sanitize organizer-authored resource pages while retaining a deliberately
 * small set of HTTPS iframe providers. The second pass also gives every embed
 * a restrictive sandbox so pasted provider markup cannot navigate the portal.
 */
export function sanitizeResourceHtml(html: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allow", "allowfullscreen", "loading", "referrerpolicy", "sandbox"],
    FORBID_TAGS: ["style", "form", "input", "button", "object", "embed"],
    FORBID_ATTR: ["style", "srcdoc"],
  });

  // Resource pages render in the browser. Keep the fallback safe if this helper
  // is ever called during server-side rendering or a non-DOM build step.
  if (typeof document === "undefined") {
    return DOMPurify.sanitize(sanitized, { FORBID_TAGS: ["iframe"] });
  }

  const template = document.createElement("template");
  template.innerHTML = sanitized;
  for (const iframe of template.content.querySelectorAll("iframe")) {
    const src = iframe.getAttribute("src")?.trim() ?? "";
    if (!isApprovedEmbedUrl(src)) {
      iframe.remove();
      continue;
    }

    iframe.setAttribute("src", src);
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation");
    iframe.setAttribute("referrerpolicy", "no-referrer");
    iframe.setAttribute("loading", "lazy");
  }

  return template.innerHTML;
}
