import { CalendarDays, MapPin, Megaphone } from "lucide-react";
import { cn } from "@opensession/ui";
import type { PublicEventSummary } from "@opensession/schemas";
import { apiUrl } from "../api/client";

/**
 * Event identity shared by the two speaker-facing surfaces (public CFP, portal).
 *
 * These pages are the only part of the product an outside speaker ever sees, so
 * they lead with the *conference*, not with our chrome. Everything here reads
 * from the public event payload — no auth, no organizer-only fields.
 */

/** Event dates as one line, in the event's own timezone.
 *
 *  Speaker-facing dates must never be rendered in the viewer's local timezone:
 *  a conference in San Francisco says "Nov 10–12" to everyone, including a
 *  speaker reading it from Berlin at 1am. `timeZone` on the formatter is what
 *  makes that true. */
export function formatEventDates(event: Pick<PublicEventSummary, "starts_at" | "ends_at" | "timezone">): string | null {
  if (!event.starts_at) return null;
  const zone = event.timezone || "UTC";
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : null;
  const day = (d: Date, withYear: boolean) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: zone,
    }).format(d);

  if (!end) return day(start, true);

  const sameMonth =
    new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: zone }).format(start) ===
    new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: zone }).format(end);
  if (sameMonth) {
    const endDay = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: zone }).format(end);
    const year = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: zone }).format(end);
    return `${day(start, false)}–${endDay}, ${year}`;
  }
  return `${day(start, false)} – ${day(end, true)}`;
}

/** The square brand mark. Deliberately the same shape in both surfaces so the
 *  CFP and the portal read as one product to a speaker moving between them.
 *  Falls back to the generic Open Session glyph until the organizer uploads
 *  an event logo (Event Settings → Branding), then swaps to it automatically. */
export function EventMark({ logoUrl, className }: { logoUrl?: string | null; className?: string }) {
  if (logoUrl) {
    return (
      <span className={cn("flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card shadow-sm", className)}>
        <img src={apiUrl(logoUrl)} alt="" className="size-full object-contain p-1" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm",
        className,
      )}
    >
      <Megaphone className="size-[55%]" />
    </span>
  );
}

/** The wide cover photo for the CFP welcome hero — the single biggest lever on
 *  whether the page reads as "a real event" or "a bare form." Renders nothing
 *  until the organizer uploads one (Event Settings → Branding); the hero still
 *  reads fine without it, this just makes it read *better* once set. */
export function EventBanner({ bannerUrl, className }: { bannerUrl?: string | null; className?: string }) {
  if (!bannerUrl) return null;
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border shadow-sm", className)}>
      <img src={apiUrl(bannerUrl)} alt="" className="aspect-[3/1] w-full object-cover" />
    </div>
  );
}

/** Dates + location as muted meta rows. Renders nothing when the event has neither. */
export function EventMeta({
  event,
  className,
}: {
  event: Pick<PublicEventSummary, "starts_at" | "ends_at" | "timezone" | "location">;
  className?: string;
}) {
  const dates = formatEventDates(event);
  if (!dates && !event.location) return null;
  return (
    <dl className={cn("flex flex-col gap-2 text-sm text-muted-foreground", className)}>
      {dates && (
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0 opacity-70" />
          <dd>{dates}</dd>
        </div>
      )}
      {event.location && (
        <div className="flex items-center gap-2">
          <MapPin className="size-4 shrink-0 opacity-70" />
          <dd>{event.location}</dd>
        </div>
      )}
    </dl>
  );
}

/**
 * The ambient backdrop used behind both speaker-facing surfaces: a soft brand
 * glow over a faint grid. Purely decorative and `aria-hidden`; it exists so the
 * pages don't read as a flat grey form on a flat grey page.
 */
export function AmbientBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div
        className="absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            "radial-gradient(90rem 44rem at 12% -12%, color-mix(in oklch, var(--primary) 20%, transparent), transparent 62%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(70rem 40rem at 20% 0%, #000 20%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(70rem 40rem at 20% 0%, #000 20%, transparent 75%)",
        }}
      />
    </div>
  );
}
