import { Link } from "react-router";
import { cn } from "@opensession/ui";

const TABS = [
  { key: "templates", label: "Templates", path: "templates" },
  { key: "automations", label: "Automations", path: "automations" },
  { key: "history", label: "History", path: "history" },
] as const;

export function CommsSubNav({ eventId, active }: { eventId: string; active: (typeof TABS)[number]["key"] }) {
  return (
    <div className="flex items-center rounded-lg bg-muted p-1 text-sm">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          to={`/app/events/${eventId}/communications/${tab.path}`}
          className={cn(
            "rounded-md px-3 py-1.5 transition-colors",
            active === tab.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
