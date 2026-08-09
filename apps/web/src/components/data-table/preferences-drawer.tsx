import { useState } from "react";
import type { Column, Table } from "@tanstack/react-table";
import { ChevronDown, ChevronUp, GripVertical, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import {
  Button,
  Input,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Checkbox,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
} from "@opensession/ui";

/** A column's display name. Non-string headers (render functions) have no text to
 *  show here, so the column id is the only honest fallback. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function columnLabel(col: Column<any, unknown>): string {
  return typeof col.columnDef.header === "string" ? col.columnDef.header : col.id;
}

export interface PreferencesDrawerProps<TData> {
  table: Table<TData>;
  /**
   * Hidden when the page already owns status filtering (e.g. Submissions' status
   * tabs). The Drafts shortcut writes a `status` column filter, which the page's
   * own filter then ANDs with — selecting "Accepted" and toggling Drafts would
   * silently yield zero rows with nothing on screen to explain why.
   */
  showDrafts?: boolean;
}

export function PreferencesDrawer<TData>({ table, showDrafts = true }: PreferencesDrawerProps<TData>) {
  const [colSearch, setColSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Columns Tab
  const allHideableCols = table.getAllLeafColumns().filter((col) => col.id !== "__select" && col.getCanHide());
  
  const filteredCols = allHideableCols.filter((col) =>
    columnLabel(col).toLowerCase().includes(colSearch.toLowerCase()),
  );

  const visibleCols = filteredCols.filter((col) => col.getIsVisible());
  const hiddenCols = filteredCols.filter((col) => !col.getIsVisible());
  const selectedCount = allHideableCols.filter((c) => c.getIsVisible()).length;

  const handleShowAll = () => {
    table.setColumnVisibility({});
  };

  const handleHideAll = () => {
    const next: Record<string, boolean> = {};
    allHideableCols.forEach((col) => {
      next[col.id] = false;
    });
    table.setColumnVisibility(next);
  };

  const handleReset = () => {
    table.resetColumnVisibility();
    table.setColumnOrder([]);
  };

  /**
   * Moves a column to `targetIndex` within the *full* leaf order.
   *
   * `columnOrder` starts empty (the table then falls back to declaration order),
   * so the first move has to materialise the whole list — reordering a partial
   * array would silently drop every column missing from it.
   */
  const reorder = (columnId: string, targetIndex: number) => {
    const order = table.getAllLeafColumns().map((col) => col.id);
    const from = order.indexOf(columnId);
    if (from < 0 || targetIndex < 0 || targetIndex >= order.length || targetIndex === from) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved!);
    table.setColumnOrder(next);
  };

  const moveColumn = (columnId: string, direction: -1 | 1) => {
    const order = table.getAllLeafColumns().map((col) => col.id);
    reorder(columnId, order.indexOf(columnId) + direction);
  };

  /** Drops `dragged` onto `target`'s slot in the full leaf order. Both ids come
   *  from the visible sub-list, so their positions are looked up in the full
   *  order rather than assumed to match the rendered indices. */
  const dropColumnOn = (draggedId: string, targetId: string) => {
    const order = table.getAllLeafColumns().map((col) => col.id);
    reorder(draggedId, order.indexOf(targetId));
  };

  // Sort Tab
  const sorting = table.getState().sorting;
  const sortableCols = table.getAllLeafColumns().filter((col) => col.getCanSort());

  // Filter Tab
  const filtering = table.getState().columnFilters;
  const filterableCols = table.getAllLeafColumns().filter((col) => col.getCanFilter());

  // Drafts is a shortcut over the same `status` column filter the Filter tab
  // edits, so the two tabs stay consistent instead of holding rival state.
  const isDraftsOnly = table.getColumn("status")?.getFilterValue() === "draft";

  const handleDraftsChange = (checked: boolean) => {
    if (checked) {
      table.getColumn("status")?.setFilterValue("draft");
    } else {
      table.getColumn("status")?.setFilterValue(undefined);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Preferences
        </Button>
      </SheetTrigger>
      <SheetContent widthClassName="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>View Preferences</SheetTitle>
          <SheetDescription>Customize how data is displayed in this table.</SheetDescription>
        </SheetHeader>

        <SheetBody className="p-0 px-6 py-2">
          <Tabs defaultValue="columns" className="w-full">
            <TabsList className={cn("mb-4 grid w-full", showDrafts ? "grid-cols-4" : "grid-cols-3")}>
              <TabsTrigger value="columns">Columns</TabsTrigger>
              <TabsTrigger value="sort">Sort</TabsTrigger>
              <TabsTrigger value="filter">Filter</TabsTrigger>
              {showDrafts && <TabsTrigger value="drafts">Drafts</TabsTrigger>}
            </TabsList>

            <TabsContent value="columns" className="flex flex-col gap-4 mt-0 outline-none">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search columns..."
                  value={colSearch}
                  onChange={(e) => setColSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">Selected ({selectedCount})</span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleShowAll} className="h-auto py-1 text-xs">
                    Show All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleHideAll} className="h-auto py-1 text-xs">
                    Hide All
                  </Button>
                </div>
              </div>

              <div className="flex max-h-[50vh] flex-col gap-4 overflow-y-auto pr-1">
                {visibleCols.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Visible ({visibleCols.length})
                    </div>
                    {visibleCols.map((col, index) => (
                      <div
                        key={col.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", col.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingId(col.id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const draggedId = e.dataTransfer.getData("text/plain");
                          if (draggedId && draggedId !== col.id) dropColumnOn(draggedId, col.id);
                          setDraggingId(null);
                        }}
                        className={cn(
                          "group flex cursor-grab items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent/60",
                          draggingId === col.id && "opacity-50",
                        )}
                      >
                        <GripVertical className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
                        <Checkbox
                          id={`col-${col.id}`}
                          checked
                          onCheckedChange={(checked) => col.toggleVisibility(!!checked)}
                        />
                        <Label htmlFor={`col-${col.id}`} className="flex-1 truncate text-sm font-normal">
                          {columnLabel(col)}
                        </Label>
                        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Move ${columnLabel(col)} up`}
                            disabled={index === 0}
                            onClick={() => moveColumn(col.id, -1)}
                          >
                            <ChevronUp />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Move ${columnLabel(col)} down`}
                            disabled={index === visibleCols.length - 1}
                            onClick={() => moveColumn(col.id, 1)}
                          >
                            <ChevronDown />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {hiddenCols.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Hidden ({hiddenCols.length})
                    </div>
                    {hiddenCols.map((col) => (
                      <div key={col.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent/60">
                        <span className="size-4 shrink-0" aria-hidden />
                        <Checkbox
                          id={`col-${col.id}`}
                          checked={false}
                          onCheckedChange={(checked) => col.toggleVisibility(!!checked)}
                        />
                        <Label htmlFor={`col-${col.id}`} className="flex-1 truncate text-sm font-normal">
                          {columnLabel(col)}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
                {filteredCols.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">No columns match “{colSearch}”.</p>
                )}
              </div>
              
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <Button variant="outline" size="sm" onClick={handleReset}>
                  Reset to Default
                </Button>
                <Button size="sm" onClick={() => setOpen(false)}>
                  Apply Changes
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="sort" className="flex flex-col gap-4 mt-0 outline-none">
              <div className="flex flex-col gap-3">
                {sorting.map((sort, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Select
                      value={sort.id}
                      onValueChange={(val) => {
                        const newSorting = [...sorting];
                        const current = sorting[index];
                        newSorting[index] = { id: val, desc: current ? !!current.desc : false };
                        table.setSorting(newSorting);
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {sortableCols.map((col) => (
                          <SelectItem key={col.id} value={col.id}>
                            {columnLabel(col)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={sort.desc ? "desc" : "asc"}
                      onValueChange={(val) => {
                        const newSorting = [...sorting];
                        const current = sorting[index];
                        newSorting[index] = { id: current ? current.id : "", desc: val === "desc" };
                        table.setSorting(newSorting);
                      }}
                    >
                      <SelectTrigger className="w-[132px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="asc">Ascending</SelectItem>
                        <SelectItem value="desc">Descending</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const newSorting = sorting.filter((_, i) => i !== index);
                        table.setSorting(newSorting);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed"
                  onClick={() => {
                    if (sortableCols.length > 0 && sortableCols[0]) {
                      table.setSorting([...sorting, { id: sortableCols[0].id, desc: false }]);
                    }
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add sort rule
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="filter" className="flex flex-col gap-4 mt-0 outline-none">
              <div className="flex flex-col gap-3">
                {filtering.map((filter, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Select
                      value={filter.id}
                      onValueChange={(val) => {
                        const newFilters = [...filtering];
                        const current = filtering[index];
                        newFilters[index] = { id: val, value: current ? current.value : "" };
                        table.setColumnFilters(newFilters);
                      }}
                    >
                      <SelectTrigger className="flex-[0.5]">
                        <SelectValue placeholder="Column" />
                      </SelectTrigger>
                      <SelectContent>
                        {filterableCols.map((col) => (
                          <SelectItem key={col.id} value={col.id}>
                            {columnLabel(col)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Filter value..."
                      className="flex-1"
                      value={filter.value as string || ""}
                      onChange={(e) => {
                        const newFilters = [...filtering];
                        const current = filtering[index];
                        newFilters[index] = { id: current ? current.id : "", value: e.target.value };
                        table.setColumnFilters(newFilters);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const newFilters = filtering.filter((_, i) => i !== index);
                        table.setColumnFilters(newFilters);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-dashed"
                    onClick={() => {
                      if (filterableCols.length > 0 && filterableCols[0]) {
                        table.setColumnFilters([...filtering, { id: filterableCols[0].id, value: "" }]);
                      }
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add filter rule
                  </Button>
                  {filtering.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => table.setColumnFilters([])}>
                      Clear all
                    </Button>
                  )}
                </div>
              </div>
            </TabsContent>

            {showDrafts && (
            <TabsContent value="drafts" className="flex flex-col gap-4 mt-0 outline-none">
              <div className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Show only drafts</Label>
                  <div className="text-sm text-muted-foreground">
                    Filter the table to display only items with a draft status.
                  </div>
                </div>
                <Switch
                  checked={isDraftsOnly}
                  onCheckedChange={handleDraftsChange}
                  disabled={!table.getColumn("status")}
                />
              </div>
              {!table.getColumn("status") && (
                <p className="mt-2 text-sm text-warning">
                  This table has no status column, so there are no drafts to filter.
                </p>
              )}
            </TabsContent>
            )}
          </Tabs>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
