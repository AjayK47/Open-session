import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ChevronsUpDown, Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@opensession/ui";
import { eventsApi } from "../api";

export function EventSwitcher({
  currentEventId,
  currentEventName,
  isLoading,
}: {
  currentEventId: string;
  currentEventName?: string;
  isLoading?: boolean;
}) {
  const navigate = useNavigate();
  const { data: events } = useQuery({ queryKey: ["events"], queryFn: eventsApi.list });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={currentEventName || "Select event"}
          className="flex min-w-0 flex-1 items-center justify-between gap-1 rounded-md px-1.5 py-1 text-left outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 hover:bg-secondary transition-colors"
        >
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {isLoading ? "Loading..." : currentEventName || "Select event"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {events?.map((event) => (
          <DropdownMenuItem
            key={event.id}
            onSelect={() => navigate(`/app/events/${event.id}/dashboard`)}
            className={event.id === currentEventId ? "bg-accent text-accent-foreground" : undefined}
          >
            {event.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/app/events")}>All events</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/app/events/new")}>
          <Plus className="h-4 w-4" />
          Create event
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
