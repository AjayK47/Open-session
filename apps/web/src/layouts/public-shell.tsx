import { Outlet } from "react-router";
import { Check } from "lucide-react";
import { cn } from "@opensession/ui";

/**
 * Public CFP shell.
 *
 * This is the first — often only — thing an outside speaker sees, so it leads
 * with the conference rather than with a form widget. The page owns its own
 * background and hero (`PublicPage` below); the shell only provides the frame,
 * because the welcome/success steps want a different rhythm from the form steps.
 */
export function PublicShell() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <Outlet />
    </div>
  );
}

/**
 * Numbered step rail.
 *
 * Replaces the old hairline progress bar: on a multi-step form the speaker needs
 * to know how many steps remain and what they are, not just roughly how far
 * along a bar has crept. Completed steps become checks so the eye can find "you
 * are here" without reading.
 */
export function StepProgress({ steps, activeIndex }: { steps: string[]; activeIndex: number }) {
  return (
    <nav aria-label="Progress" className="mb-8">
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {steps.map((step, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <li key={step} className={cn("flex items-center gap-1.5 sm:gap-2", i < steps.length - 1 && "flex-1")}>
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums transition-colors",
                  done && "bg-primary/15 text-primary ring-1 ring-inset ring-primary/30",
                  active && "bg-primary text-primary-foreground shadow-sm",
                  !done && !active && "bg-muted text-muted-foreground",
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden whitespace-nowrap text-xs sm:inline",
                  active ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {step}
              </span>
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn("h-px min-w-3 flex-1 transition-colors", done ? "bg-primary/40" : "bg-border")}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
