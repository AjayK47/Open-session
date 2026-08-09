import { useMemo, useState, type ReactNode } from "react";
import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  Search,
} from "lucide-react";
import { Button, Checkbox, Input } from "@opensession/ui";
import { EmptyState } from "../empty-state";
import { SavedViewsMenu, viewToTableState } from "./saved-views-menu";
import { PreferencesDrawer } from "./preferences-drawer";

/**
 * Shared table shell (frontend plan §5.1). Powers Submissions, Sessions, Speakers,
 * Tasks, Files, Communications history, Reviewer assignments — one implementation,
 * many consumers, so behavior (search/sort/columns/selection/pagination) stays
 * consistent across the whole app.
 */
export interface DataTableProps<TData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<TData, any>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  searchPlaceholder?: string;
  toolbarLeft?: ReactNode;
  toolbarRight?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  isLoading?: boolean;
  pageSize?: number;
  enableSelection?: boolean;
  /** Enables the Saved Views menu for this table. */
  savedViews?: { eventId: string; resourceType: string };
  /** Columns off by default — still reachable via the Columns menu. */
  initialColumnVisibility?: VisibilityState;
  /** Set when the page filters status itself (status tabs), so the Preferences
   *  drawer does not offer a second, conflicting status filter. */
  ownsStatusFilter?: boolean;
  bulkActions?: (selectedIds: string[], clearSelection: () => void) => ReactNode;
  onRowClick?: (row: TData) => void;
}

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  searchPlaceholder = "Search...",
  toolbarLeft,
  toolbarRight,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  isLoading,
  pageSize = 25,
  enableSelection = false,
  savedViews,
  initialColumnVisibility,
  ownsStatusFilter = false,
  bulkActions,
  onRowClick,
}: DataTableProps<TData>) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initialColumnVisibility ?? {});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const tableColumns = useMemo<ColumnDef<TData, any>[]>(() => {
    if (!enableSelection) return columns;
    const selectColumn: ColumnDef<TData, any> = {
      id: "__select",
      size: 36,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(Boolean(v))}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(Boolean(v))}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select row"
        />
      ),
    };
    return [selectColumn, ...columns];
  }, [columns, enableSelection]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: { globalFilter, sorting, columnVisibility, rowSelection },
    getRowId,
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: enableSelection ? setRowSelection : undefined,
    enableRowSelection: enableSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // `initialColumnVisibility` also has to reach `initialState` — that is what
    // the drawer's Reset to Default restores to. Seeding only the React state
    // above makes reset fall back to "everything visible" instead of the
    // defaults this page chose.
    initialState: { pagination: { pageSize }, columnVisibility: initialColumnVisibility ?? {} },
  });

  const selectedIds = Object.keys(rowSelection);
  const rows = table.getRowModel().rows;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
          />
        </div>
        {toolbarLeft}
        <div className="ml-auto flex items-center gap-2">
          {savedViews && (
            <SavedViewsMenu
              eventId={savedViews.eventId}
              resourceType={savedViews.resourceType}
              current={{
                search: globalFilter,
                sorting,
                visibleColumns: table
                  .getAllLeafColumns()
                  .filter((col) => col.id !== "__select" && col.getIsVisible())
                  .map((col) => col.id),
              }}
              onApply={(view) => {
                const ids = table
                  .getAllLeafColumns()
                  .filter((col) => col.id !== "__select" && col.getCanHide())
                  .map((col) => col.id);
                const next = viewToTableState(view, ids);
                setGlobalFilter(next.search);
                setSorting(next.sorting);
                setColumnVisibility(next.visibility);
                // The selection checkbox is a system column and is not part of a
                // saved view; re-pin it to the front, or an applied view leaves it
                // stranded after every data column.
                table.setColumnOrder(
                  next.columnOrder.length > 0 && enableSelection
                    ? ["__select", ...next.columnOrder]
                    : next.columnOrder,
                );
              }}
            />
          )}
          <PreferencesDrawer table={table} showDrafts={!ownsStatusFilter} />
          {toolbarRight}
        </div>
      </div>

      {enableSelection && selectedIds.length > 0 && bulkActions && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-accent px-3 py-2 text-sm">
          <span className="font-medium text-accent-foreground">{selectedIds.length} selected</span>
          {bulkActions(selectedIds, () => setRowSelection({}))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="whitespace-nowrap px-4 py-2.5">
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : header.column.getIsSorted() === "desc" ? (
                          <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {tableColumns.map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-full max-w-32 animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={tableColumns.length} className="p-0">
                  <EmptyState icon={FileQuestion} title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={onRowClick ? "cursor-pointer transition-colors hover:bg-secondary/60" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="whitespace-nowrap px-4 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && rows.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
              table.getFilteredRowModel().rows.length,
            )}{" "}
            of {table.getFilteredRowModel().rows.length} rows
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
