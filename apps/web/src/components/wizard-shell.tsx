import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Check, ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@opensession/ui";

export interface WizardStep {
  key: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
}

/**
 * Left-rail step wizard (form builder, event creation).
 *
 * Deliberately uses normal document flow with `sticky` header/rail/footer rather
 * than a nested `h-full` flex column with its own scrollers. The previous
 * version created a second scroll container inside the shell's `<main>`, which
 * silently clipped the last step in the rail and let the footer sit on top of
 * the form. Sticky + single scroller cannot clip.
 */
export function WizardShell({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  headerActions,
  steps,
  activeStep,
  completedSteps,
  onStepChange,
  children,
  footer,
  contentWidth = "form",
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  headerActions?: ReactNode;
  steps: WizardStep[];
  activeStep: string;
  completedSteps?: Set<string>;
  onStepChange: (key: string) => void;
  children: ReactNode;
  footer?: ReactNode;
  /** "form" caps the measure for single-column forms; "wide" is for steps that
   *  carry their own side-by-side layout (e.g. an editor + live preview). */
  contentWidth?: "form" | "wide";
}) {
  const activeIndex = steps.findIndex((s) => s.key === activeStep);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border bg-background/85 px-6 py-3.5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          {backHref && (
            <Link
              to={backHref}
              aria-label={backLabel}
              className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-xs transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </Link>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-6 text-foreground">{title}</h1>
            {subtitle ? <p className="truncate text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
      </header>

      <div className="flex items-start">
        <aside className="sticky top-[3.75rem] hidden w-64 shrink-0 self-start p-4 lg:block">
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.055em] text-muted-foreground/80">
            Steps
          </p>
          <nav className="flex flex-col gap-0.5">
            {steps.map((step, index) => {
              const isActive = step.key === activeStep;
              const isDone = completedSteps?.has(step.key) ?? index < activeIndex;
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => onStepChange(step.key)}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-100",
                    isActive
                      ? "bg-card shadow-xs ring-1 ring-border"
                      : "hover:bg-accent",
                  )}
                >
                  <span
                    className={cn(
                      "mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isDone
                          ? "bg-success/15 text-success"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isDone && !isActive ? <Check className="size-3" /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-sm leading-5",
                        isActive ? "font-medium text-foreground" : "text-foreground/75",
                      )}
                    >
                      {step.label}
                    </span>
                    {step.description ? (
                      <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{step.description}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 border-l border-border">
          {/* Bottom padding clears the sticky footer so the last field is always reachable. */}
          <div
            className={cn(
              "px-6 py-6 pb-28",
              contentWidth === "form" ? "mx-auto w-full max-w-3xl" : "w-full",
            )}
          >
            {children}
          </div>
        </main>
      </div>

      {footer && (
        <div className="sticky bottom-0 z-30 flex items-center justify-between gap-3 border-t border-border bg-background/90 px-6 py-3 backdrop-blur">
          {footer}
        </div>
      )}
    </div>
  );
}
