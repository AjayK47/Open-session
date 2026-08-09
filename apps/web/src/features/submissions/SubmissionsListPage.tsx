import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, Plus, CheckCircle2, XCircle } from "lucide-react";
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from "@opensession/ui";
import { toast } from "sonner";
import { manualSubmissionSchema } from "@opensession/schemas";
import type { ManualSubmissionInput, Submission } from "@opensession/schemas";
import { createColumnHelper, DataTable, InlineEditCell, StatusTabs } from "../../components/data-table";
import { OptionsMenu } from "./OptionsMenu";
import { DecisionDialog, type DecisionPayload } from "./DecisionDialog";
import { submissionsApi, programApi, SUBMISSION_STATUS_TABS, ApiError } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { PageHeader } from "../../layouts/organizer-shell";
import { DrawerForm } from "../../components/drawer-form";
import { StatusPill, SUBMISSION_STATUS_TONE } from "../../components/status-pill";
import { TrackPill, TrackMultiSelect } from "../../components/track-tag-picker";
import { ParticipantListEditor } from "../../components/participant-list-editor";

const columnHelper = createColumnHelper<Submission>();

const STATUS_OPTIONS = [
  { value: "accepted", label: "Accepted" },
  { value: "accept_queue", label: "Accept Queue" },
  { value: "pending_review", label: "Pending" },
  { value: "decline_queue", label: "Decline Queue" },
  { value: "declined", label: "Declined" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "draft", label: "Draft" },
];

export function SubmissionsListPage() {
  const { eventId } = useCurrentEvent();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["submissions", eventId],
    queryFn: () => submissionsApi.list(eventId),
  });
  const { data: tracks = [] } = useQuery({ queryKey: ["tracks", eventId], queryFn: () => programApi.tracks.list(eventId) });

  const statusDecide = useMutation({
    mutationFn: ({ id, target }: { id: string; target: string }) => submissionsApi.decide(id, target),
    onSuccess: () => {
      toast.success("Status updated");
      void queryClient.invalidateQueries({ queryKey: ["submissions", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not update status"),
  });

  const tabItems = SUBMISSION_STATUS_TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    count: tab.status ? submissions.filter((s) => s.status === tab.status).length : submissions.length,
  }));
  const filtered = useMemo(() => {
    const tab = SUBMISSION_STATUS_TABS.find((t) => t.key === activeTab);
    if (!tab?.status) return submissions;
    return submissions.filter((s) => s.status === tab.status);
  }, [submissions, activeTab]);

  // Bulk accept/decline also goes through the dialog so a note can be attached
  // once and applied to the whole selection.
  const [bulkPending, setBulkPending] = useState<{ target: "accepted" | "declined"; ids: string[]; clear: () => void } | null>(null);

  const bulkDecision = useMutation({
    mutationFn: (input: { ids: string[]; target: string; options?: DecisionPayload }) =>
      submissionsApi.bulkDecision(eventId, input.ids, input.target, input.options ?? undefined),
    onSuccess: (res) => {
      toast.success(`Updated ${res.updated} submission(s)`);
      void queryClient.invalidateQueries({ queryKey: ["submissions", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not update"),
  });

  const columns = [
    columnHelper.accessor("reference_code", {
      header: "Ref",
      cell: (info) => <span className="tabular text-muted-foreground">{info.getValue() ?? "—"}</span>,
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => (
        <InlineEditCell
          value={info.getValue()}
          type="select"
          label="Edit status"
          options={STATUS_OPTIONS}
          onSave={async (newStatus) => {
            await statusDecide.mutateAsync({ id: info.row.original.id, target: newStatus });
          }}
          renderValue={(val) => <StatusPill label={val} tone={SUBMISSION_STATUS_TONE[val] ?? "neutral"} />}
        />
      ),
    }),
    columnHelper.accessor("title", {
      header: "Title",
      cell: (info) => <span className="font-medium text-foreground">{info.getValue() || "Untitled"}</span>,
    }),
    columnHelper.accessor("track_id", {
      header: "Track",
      cell: (info) => {
        // A talk can be cross-listed; show every track, primary first.
        const ids = info.row.original.track_ids?.length
          ? info.row.original.track_ids
          : [info.getValue()].filter(Boolean as unknown as (v: string | null) => v is string);
        const matched = ids.map((id) => tracks.find((t) => t.id === id)).filter(Boolean);
        if (matched.length === 0) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="flex flex-wrap items-center gap-1">
            {matched.map((track) => (
              <TrackPill key={track!.id} id={track!.id} name={track!.name} />
            ))}
          </span>
        );
      },
    }),
    columnHelper.accessor((row) => row.participants?.length ?? 0, {
      id: "speakers",
      header: "Speakers",
      cell: (info) => (info.row.original.participants ?? []).map((p) => `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email).join(", ") || "—",
    }),
    columnHelper.accessor("aggregate_rating", {
      header: "Rating",
      cell: (info) => info.getValue() ?? "—",
    }),
    columnHelper.accessor("submitted_at", {
      header: "Submitted",
      cell: (info) => (info.getValue() ? new Date(info.getValue()!).toLocaleDateString() : "—"),
    }),
    // Hidden by default — available through the Columns menu and saveable in a view.
    columnHelper.accessor("capacity", {
      header: "Capacity",
      cell: (info) => <span className="tabular">{info.getValue() ?? "—"}</span>,
    }),
    columnHelper.accessor("ceu_credits", {
      header: "CEU Credits",
      cell: (info) => <span className="tabular">{info.getValue() ?? "—"}</span>,
    }),
    columnHelper.accessor("client_session_id", {
      header: "Client ID",
      cell: (info) => info.getValue() || "—",
    }),
    columnHelper.accessor("language", {
      header: "Language",
      cell: (info) => info.getValue() || "—",
    }),
  ];

  return (
    <div>
      <PageHeader
        icon={FileText}
        title="Submissions"
        subtitle="Review and manage your abstract and session submissions."
        actions={
          <>
            <OptionsMenu eventId={eventId} />
            <Button size="sm" onClick={() => setDrawerOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Abstract
            </Button>
          </>
        }
      />
      <div className="space-y-4 px-6 py-6">
        <StatusTabs items={tabItems} active={activeTab} onChange={setActiveTab} />
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          searchPlaceholder="Search submissions..."
          enableSelection
          savedViews={{ eventId, resourceType: "submissions" }}
          initialColumnVisibility={{ capacity: false, ceu_credits: false, client_session_id: false, language: false }}
          ownsStatusFilter
          onRowClick={(row) => navigate(`/app/events/${eventId}/submissions/${row.id}`)}
          emptyTitle="No submissions yet"
          bulkActions={(ids, clear) => (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBulkPending({ target: "accepted", ids, clear })}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBulkPending({ target: "declined", ids, clear })}
              >
                <XCircle className="h-3.5 w-3.5" />
                Decline
              </Button>
            </>
          )}
        />
      </div>

      <ManualAbstractDrawer open={drawerOpen} onOpenChange={setDrawerOpen} eventId={eventId} tracks={tracks} />

      <DecisionDialog
        open={bulkPending !== null}
        onOpenChange={(next) => !next && setBulkPending(null)}
        decision={bulkPending?.target ?? null}
        count={bulkPending?.ids.length ?? 0}
        isPending={bulkDecision.isPending}
        onConfirm={(options) => {
          if (!bulkPending) return;
          bulkDecision.mutate(
            { ids: bulkPending.ids, target: bulkPending.target, options },
            {
              onSuccess: () => {
                bulkPending.clear();
                setBulkPending(null);
              },
            },
          );
        }}
      />
    </div>
  );
}

function ManualAbstractDrawer({
  open,
  onOpenChange,
  eventId,
  tracks,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  tracks: { id: string; name: string }[];
}) {
  const queryClient = useQueryClient();
  const form = useForm<ManualSubmissionInput>({
    resolver: zodResolver(manualSubmissionSchema),
    defaultValues: { title: "", description: "", status: "pending_review", participants: [] },
  });

  const create = useMutation({
    mutationFn: (values: ManualSubmissionInput) => submissionsApi.createManual(eventId, values),
    onSuccess: () => {
      toast.success("Abstract created");
      onOpenChange(false);
      form.reset({ title: "", description: "", status: "pending_review", participants: [] });
      void queryClient.invalidateQueries({ queryKey: ["submissions", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not create abstract"),
  });

  return (
    <DrawerForm
      open={open}
      onOpenChange={onOpenChange}
      title="Add Abstract"
      onSubmit={form.handleSubmit((v) => create.mutate(v))}
      isSubmitting={create.isPending}
      submitLabel="Create Abstract"
    >
      <Tabs defaultValue="details">
        <TabsList className="mb-4 grid w-full grid-cols-2">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="participants">Participants</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input placeholder="Enter abstract title..." {...form.register("title")} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.watch("status") ?? "pending_review"} onValueChange={(v) => form.setValue("status", v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={4} placeholder="Enter description..." {...form.register("description")} />
          </div>
          <div className="space-y-1.5">
            <Label>Tracks</Label>
            <TrackMultiSelect
              tracks={tracks}
              value={form.watch("track_ids") ?? []}
              onChange={(next) => form.setValue("track_ids", next)}
            />
            <p className="text-xs text-muted-foreground">
              Pick one or more. The first is the primary track used on the agenda.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Starts At</Label>
              <Input type="datetime-local" {...form.register("starts_at")} />
            </div>
            <div className="space-y-1.5">
              <Label>Ends At</Label>
              <Input type="datetime-local" {...form.register("ends_at")} />
            </div>
            <div className="space-y-1.5">
              <Label>Capacity</Label>
              <Input type="number" min={0} placeholder="Number of attendees" {...form.register("capacity")} />
            </div>
            <div className="space-y-1.5">
              <Label>CEU Credits</Label>
              <Input type="number" min={0} step="0.5" placeholder="Enter CEU credits" {...form.register("ceu_credits")} />
            </div>
            <div className="space-y-1.5">
              <Label>Client ID</Label>
              <Input placeholder="Enter client ID" {...form.register("client_session_id")} />
            </div>
            <div className="space-y-1.5">
              <Label>Language</Label>
              <Input placeholder="English" {...form.register("language")} />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="participants">
          <div className="space-y-1.5">
            <Label>Participants</Label>
            <ParticipantListEditor value={form.watch("participants") ?? []} onChange={(v) => form.setValue("participants", v)} />
          </div>
        </TabsContent>
      </Tabs>
    </DrawerForm>
  );
}
