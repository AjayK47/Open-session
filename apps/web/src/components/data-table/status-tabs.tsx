import { cn } from "@opensession/ui";

export interface StatusTabItem {
  key: string;
  label: string;
  count: number;
}

/** Tabs-with-counts above a DataTable (Sessionboard's "All Abstracts 2  Accepted 0 ..."). */
export function StatusTabs({
  items,
  active,
  onChange,
}: {
  items: StatusTabItem[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === item.key
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
              active === item.key ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {item.count}
          </span>
        </button>
      ))}
    </div>
  );
}
