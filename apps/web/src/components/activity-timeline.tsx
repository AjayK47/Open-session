import type { LucideIcon } from "lucide-react";
import { Circle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface ActivityItem {
  id: string;
  label: string;
  timestamp: string;
  icon?: LucideIcon;
}

/** Vertical timeline for submission/session/speaker "Activity" tabs. */
export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }
  return (
    <ol className="relative space-y-5 border-l border-border pl-5">
      {items.map((item) => {
        const Icon = item.icon ?? Circle;
        return (
          <li key={item.id} className="relative">
            <span className="absolute -left-[26px] flex h-4 w-4 items-center justify-center rounded-full bg-background ring-2 ring-border">
              <Icon className="h-2.5 w-2.5 text-muted-foreground" />
            </span>
            <p className="text-sm text-foreground">{item.label}</p>
            <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}</p>
          </li>
        );
      })}
    </ol>
  );
}
