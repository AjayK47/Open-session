import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FileText, FolderArchive, MoreHorizontal, Upload } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@opensession/ui";
import { toast } from "sonner";
import type { SessionImportPreview } from "@opensession/schemas";
import { sessionsApi, submissionsApi, ApiError } from "../../api";

/**
 * Bulk actions for the submissions table: exports, a zipped file bundle, and a
 * CSV session import. Import is deliberately two-phase — the preview endpoint
 * validates without writing, so nothing is created until the errors are visible.
 */
export function OptionsMenu({ eventId }: { eventId: string }) {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <MoreHorizontal />
            Options
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setImportOpen(true)}>
            <Upload />
            Import sessions
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href={submissionsApi.exportCsvUrl(eventId)}>
              <FileText />
              Export .CSV
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={submissionsApi.exportXlsxUrl(eventId)}>
              <FileSpreadsheet />
              Export .XLSX
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href={submissionsApi.filesBundleUrl(eventId)}>
              <FolderArchive />
              Download files bundle
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ImportSessionsDialog eventId={eventId} open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}

function ImportSessionsDialog({
  eventId,
  open,
  onOpenChange,
}: {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<SessionImportPreview | null>(null);

  function reset() {
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const runPreview = useMutation({
    mutationFn: (file: File) => sessionsApi.importPreview(eventId, file),
    onSuccess: setPreview,
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not read that file"),
  });

  const commit = useMutation({
    mutationFn: () => sessionsApi.importCommit(eventId, preview!.rows.map((r) => r.values), preview!.mapping),
    onSuccess: (result) => {
      toast.success(`Imported ${result.count} session${result.count === 1 ? "" : "s"}`);
      void queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      onOpenChange(false);
      reset();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Import failed"),
  });

  const validRows = preview?.rows.filter((r) => r.errors.length === 0) ?? [];
  const invalidRows = preview?.rows.filter((r) => r.errors.length > 0) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import sessions</DialogTitle>
          <DialogDescription>
            Upload a CSV. Nothing is created until you confirm — this first step only validates.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <div className="space-y-3">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-foreground"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) runPreview.mutate(file);
              }}
            />
            {runPreview.isPending && <p className="text-sm text-muted-foreground">Reading file…</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-success">{validRows.length} ready</span>
              {invalidRows.length > 0 && <span className="text-destructive">{invalidRows.length} with errors</span>}
            </div>

            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Row</th>
                    {preview.columns.map((col) => (
                      <th key={col} className="px-3 py-2 font-medium">
                        {col}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-medium">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.rows.map((row) => (
                    <tr key={row.row} className={cn(row.errors.length > 0 && "bg-destructive/5")}>
                      <td className="px-3 py-2 tabular text-muted-foreground">{row.row}</td>
                      {preview.columns.map((col) => (
                        <td key={col} className="max-w-40 truncate px-3 py-2">
                          {row.values[col] ?? "—"}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-xs text-destructive">{row.errors.join("; ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                Choose another file
              </Button>
              <Button onClick={() => commit.mutate()} disabled={validRows.length === 0 || commit.isPending}>
                <Download />
                {commit.isPending ? "Importing…" : `Import ${validRows.length}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
