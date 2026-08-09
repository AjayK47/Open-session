import type { ReactNode } from "react";
import { cn } from "@opensession/ui";

/**
 * Page chrome shared by every organizer screen.
 *
 * One horizontal gutter (`px-6`) is used by both the header and the body so
 * titles and content share a single left edge. Pages previously mixed px-5 /
 * px-6 / px-8, which is what made the app read as unaligned screen-to-screen.
 */

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  className,
  sticky = true,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  /** Keeps the title bar visible while the body scrolls under it. */
  sticky?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-border bg-background/85 px-6 py-5 backdrop-blur",
        sticky && "sticky top-0 z-20",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-xs">
            <Icon className="size-4.5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-semibold leading-7 text-foreground">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Body wrapper. `size` caps the measure for reading/forms — an unbounded form
 * stretched across a 1600px monitor is a big part of why these pages felt
 * unfinished.
 */
export function PageBody({
  children,
  className,
  size = "full",
}: {
  children: ReactNode;
  className?: string;
  size?: "form" | "content" | "wide" | "full";
}) {
  return (
    <div
      className={cn(
        "px-6 py-6",
        size === "form" && "mx-auto w-full max-w-2xl",
        size === "content" && "mx-auto w-full max-w-4xl",
        size === "wide" && "mx-auto w-full max-w-6xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Titled block inside a page body, with an optional right-aligned action. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            {title ? <h2 className="text-[15px] font-semibold text-foreground">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
