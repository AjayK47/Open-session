import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { IconChip, cn } from "@opensession/ui";

/** Dashboard building block: optional icon chip, label, big number, optional link. */
export function StatTile({
  label,
  value,
  icon: Icon,
  href,
  tone = "default",
  hint,
  className,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  href?: string;
  tone?: "default" | "brand" | "success" | "warning" | "danger";
  /** Small caption under the number — trend, share of total, etc. */
  hint?: string;
  className?: string;
}) {
  const valueClass =
    tone === "warning"
      ? "text-warning"
      : tone === "danger"
        ? "text-destructive"
        : tone === "success"
          ? "text-success"
          : "text-foreground";

  const chipTone = tone === "default" ? "neutral" : tone === "brand" ? "brand" : tone;

  const content = (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-border bg-card p-4",
        "transition-[border-color,box-shadow] duration-150",
        href && "hover:border-foreground/20 hover:shadow-sm",
        className,
      )}
    >
      {Icon ? (
        <IconChip tone={chipTone} size="default">
          <Icon />
        </IconChip>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-muted-foreground">{label}</p>
        <p className={cn("mt-0.5 text-2xl font-semibold leading-8 tabular", valueClass)}>{value}</p>
        {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        to={href}
        className="block rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
      >
        {content}
      </Link>
    );
  }
  return content;
}
