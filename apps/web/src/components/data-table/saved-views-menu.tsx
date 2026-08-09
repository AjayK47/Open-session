import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SortingState, VisibilityState } from "@tanstack/react-table";
import { Bookmark, Check, Plus, Trash2, Pencil } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  cn,
} from "@opensession/ui";
import { toast } from "sonner";
import type { SavedView } from "@opensession/schemas";
import { savedViewsApi, ApiError } from "../../api";

export interface TableViewState {
  search: string;
  sorting: SortingState;
  /** Ids of the columns currently visible, in table order. */
  visibleColumns: string[];
}

/**
 * Saves and restores a table's search, sort, and column visibility.
 *
 * The backend already models this (`/events/{id}/saved-views`); this is the UI
 * that was missing. Views are per-resource, so the Submissions table never
 * offers a view saved against Sessions.
 */
export function SavedViewsMenu({
  eventId,
  resourceType,
  current,
  onApply,
}: {
  eventId: string;
  resourceType: string;
  current: TableViewState;
  onApply: (view: SavedView) => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["saved-views", eventId, resourceType];
  const [activeId, setActiveId] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const { data: views = [] } = useQuery({
    queryKey,
    queryFn: () => savedViewsApi.list(eventId, resourceType),
    enabled: Boolean(eventId),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey });
  }

  function failed(error: unknown, fallback: string) {
    toast.error(error instanceof ApiError ? error.message2 : fallback);
  }

  const create = useMutation({
    mutationFn: () =>
      savedViewsApi.create(eventId, {
        resource_type: resourceType,
        name: name.trim(),
        filters: { search: current.search },
        sorts: current.sorting.map((s) => ({ id: s.id, desc: s.desc })),
        columns: current.visibleColumns,
      }),
    onSuccess: (view) => {
      toast.success(`Saved “${view.name}”`);
      setActiveId(view.id);
      setNaming(false);
      setName("");
      invalidate();
    },
    onError: (error) => failed(error, "Could not save view"),
  });

  const overwrite = useMutation({
    mutationFn: (view: SavedView) =>
      savedViewsApi.update(view.id, {
        filters: { search: current.search },
        sorts: current.sorting.map((s) => ({ id: s.id, desc: s.desc })),
        columns: current.visibleColumns,
      }),
    onSuccess: () => {
      toast.success("View updated");
      invalidate();
    },
    onError: (error) => failed(error, "Could not update view"),
  });

  const remove = useMutation({
    mutationFn: (viewId: string) => savedViewsApi.remove(viewId),
    onSuccess: (_data, viewId) => {
      toast.success("View deleted");
      if (activeId === viewId) setActiveId(null);
      invalidate();
    },
    onError: (error) => failed(error, "Could not delete view"),
  });

  const activeName = views.find((v) => v.id === activeId)?.name;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) {
          setNaming(false);
          setName("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Bookmark className={cn(activeId && "text-primary")} />
          {activeName ?? "Saved views"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Saved views</DropdownMenuLabel>
        {views.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            No saved views yet. Filter or sort the table, then save it.
          </p>
        )}
        {views.map((view) => (
          <DropdownMenuItem
            key={view.id}
            onSelect={() => {
              setActiveId(view.id);
              onApply(view);
            }}
            className="group justify-between"
          >
            <span className="flex min-w-0 items-center gap-2">
              {activeId === view.id ? (
                <Check className="text-primary" />
              ) : (
                <span aria-hidden className="size-4 shrink-0" />
              )}
              <span className="truncate">{view.name}</span>
            </span>
            <span className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                aria-label={`Update ${view.name} to current view`}
                title="Overwrite with current view"
                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  overwrite.mutate(view);
                }}
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Delete ${view.name}`}
                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  remove.mutate(view.id);
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {naming ? (
          // Keep the menu open while typing — Radix would otherwise close it on
          // the first keystroke that bubbles up as a menu shortcut.
          <div className="p-1.5" onKeyDown={(e) => e.stopPropagation()}>
            <Input
              autoFocus
              value={name}
              placeholder="View name"
              className="h-8"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) create.mutate();
                if (e.key === "Escape") setNaming(false);
              }}
            />
            <Button
              size="sm"
              className="mt-1.5 w-full"
              disabled={!name.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              Save current view
            </Button>
          </div>
        ) : (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setNaming(true);
            }}
          >
            <Plus />
            Save current view
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Turns a stored view back into the table state shape. */
export function viewToTableState(
  view: SavedView,
  allColumnIds: string[],
): { search: string; sorting: SortingState; visibility: VisibilityState; columnOrder: string[] } {
  const saved = view.columns ?? [];
  // A column added to the app after the view was saved should stay visible
  // rather than silently disappearing, so only hide what the view knew about.
  const visibility: VisibilityState = {};
  for (const id of allColumnIds) {
    if (saved.length > 0) visibility[id] = saved.includes(id);
  }
  // `columns` is stored in display order, so it doubles as the column order.
  // Ids the view never knew about are appended so a newly added column still
  // has a defined position instead of being dropped from the order entirely.
  const known = saved.filter((id) => allColumnIds.includes(id));
  const columnOrder = saved.length > 0 ? [...known, ...allColumnIds.filter((id) => !known.includes(id))] : [];
  return {
    search: typeof view.filters?.search === "string" ? view.filters.search : "",
    sorting: (view.sorts ?? []).map((s) => ({ id: s.id, desc: Boolean(s.desc) })),
    visibility,
    columnOrder,
  };
}
