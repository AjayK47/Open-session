import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Building2, Mail, Tag, Upload, UsersRound } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
} from "@opensession/ui";
import type { CrmContact } from "../../api";
import { toast } from "sonner";
import { createColumnHelper, DataTable } from "../../components/data-table";
import { ApiError, crmApi } from "../../api";
import { useOrganizationContext } from "../../lib/organization";

const columnHelper = createColumnHelper<CrmContact>();

/**
 * Speaker CRM (CRM-01): an org-level, cross-event contact directory. Lives
 * outside any single event's /app/events/:eventId nesting on purpose — the
 * whole point is that a contact here is reusable across every event this
 * organization runs, not scoped to one.
 */
export function CrmDirectoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: context } = useOrganizationContext();
  const importRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState({ subject: "A note from our event team", html: "<p>Hi {{contact.first_name}},</p><p></p>" });

  const { data: contacts = [], isLoading } = useQuery({ queryKey: ["crm", "people"], queryFn: () => crmApi.list() });
  const { data: dashboard } = useQuery({ queryKey: ["crm", "dashboard"], queryFn: crmApi.dashboard });

  const importCsv = useMutation({
    mutationFn: (file: File) => crmApi.importCsv(file),
    onSuccess: (result) => {
      const failures = result.errors.length ? ` · ${result.errors.length} row error(s)` : "";
      toast.success(`${result.created} created · ${result.updated} updated${failures}`);
      void queryClient.invalidateQueries({ queryKey: ["crm"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not import CSV"),
  });

  const bulkEmail = useMutation({
    mutationFn: (ids: string[]) => crmApi.bulkEmail(ids, message.subject, message.html),
    onSuccess: (result) => {
      toast.success(`Sent ${result.sent} email(s)${result.failed.length ? ` · ${result.failed.length} failed` : ""}`);
      setEmailOpen(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not send email"),
  });

  const columns = [
    columnHelper.accessor((row) => `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || row.primary_email, {
      id: "name",
      header: "Name",
      cell: (info) => (
        <div className="flex items-center gap-2">
          <Avatar className="size-7">
            <AvatarFallback className="text-[10px]">{info.getValue().slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-foreground">{info.getValue()}</p>
            <p className="text-xs text-muted-foreground">{info.row.original.primary_email}</p>
          </div>
        </div>
      ),
    }),
    columnHelper.accessor("company", { header: "Company", cell: (info) => info.getValue() || "—" }),
    columnHelper.accessor("job_title", { header: "Title", cell: (info) => info.getValue() || "—" }),
    columnHelper.accessor("tags", {
      header: "Tags",
      cell: (info) => (
        <div className="flex flex-wrap gap-1">
          {info.getValue().length > 0
            ? info.getValue().map((tag) => <Badge key={tag} variant="muted">{tag}</Badge>)
            : <span className="text-muted-foreground">—</span>}
        </div>
      ),
    }),
    columnHelper.accessor("event_count", {
      header: "Events",
      cell: (info) => <span>{info.getValue()}{info.getValue() > 1 ? " (returning)" : ""}</span>,
    }),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/70 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
          <Button variant="ghost" size="icon-sm" asChild><Link to="/app/events"><ArrowLeft /></Link></Button>
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><UsersRound className="size-4" /></span>
            <div><p className="truncate text-sm font-semibold">{context?.organization?.name ?? "Speaker CRM"}</p><p className="text-[11px] text-muted-foreground">Cross-event speaker directory</p></div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-9">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Speaker CRM</h1>
            <p className="mt-1 text-sm text-muted-foreground">Every person your organization has ever worked with, across every event.</p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={importRef} hidden type="file" accept=".csv,text/csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importCsv.mutateAsync(file); e.target.value = ""; }} />
            <Button variant="outline" onClick={() => importRef.current?.click()} disabled={importCsv.isPending}><Upload />{importCsv.isPending ? "Importing…" : "Import CSV"}</Button>
          </div>
        </div>

        {dashboard && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total contacts" value={dashboard.total_contacts} icon={UsersRound} />
            <StatCard label="Events run" value={dashboard.total_events} icon={Building2} />
            <StatCard label="Returning speakers" value={dashboard.returning_speakers} icon={Tag} />
            <StatCard
              label="Top company"
              value={dashboard.top_companies[0]?.name ?? "—"}
              icon={Building2}
              sub={dashboard.top_companies[0] ? `${dashboard.top_companies[0].count} contact(s)` : undefined}
            />
          </div>
        )}

        <div className="mt-8">
          <DataTable
            columns={columns}
            data={search ? contacts.filter((c) => `${c.first_name ?? ""} ${c.last_name ?? ""} ${c.primary_email} ${c.company ?? ""}`.toLowerCase().includes(search.toLowerCase())) : contacts}
            isLoading={isLoading}
            searchPlaceholder="Search contacts…"
            enableSelection
            emptyTitle="No contacts yet"
            emptyDescription="Import a CSV, or push a speaker here from any event's roster."
            onRowClick={(row) => navigate(`/app/crm/${row.id}`)}
            bulkActions={(ids, clear) => (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setSelectedIds(ids); setEmailOpen(true); clear(); }}
              >
                <Mail />Email selected
              </Button>
            )}
          />
        </div>
      </main>

      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email {selectedIds.length} contact(s)</DialogTitle>
            <DialogDescription>Merge tags like <code>{"{{contact.first_name}}"}</code> resolve per recipient.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={message.subject} onChange={(e) => setMessage((m) => ({ ...m, subject: e.target.value }))} placeholder="Subject" />
            <Textarea rows={8} value={message.html} onChange={(e) => setMessage((m) => ({ ...m, html: e.target.value }))} placeholder="Message (HTML)" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)}>Cancel</Button>
            <Button onClick={() => bulkEmail.mutate(selectedIds)} disabled={bulkEmail.isPending}>{bulkEmail.isPending ? "Sending…" : "Send"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, sub }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground"><Icon className="size-3.5" /><span className="text-xs font-medium uppercase tracking-wide">{label}</span></div>
      <p className="mt-2 truncate text-xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
