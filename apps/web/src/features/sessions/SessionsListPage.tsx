import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { ListChecks, Plus } from "lucide-react";
import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@opensession/ui";
import { toast } from "sonner";
import { z } from "zod";
import { participantInputSchema } from "@opensession/schemas";
import type { ProgramSession } from "@opensession/schemas";
import { createColumnHelper, DataTable } from "../../components/data-table";
import { sessionsApi, programApi, ApiError } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { PageHeader } from "../../layouts/organizer-shell";
import { DrawerForm } from "../../components/drawer-form";
import { StatusPill, SESSION_STATUS_TONE } from "../../components/status-pill";
import { ParticipantListEditor } from "../../components/participant-list-editor";

const columnHelper = createColumnHelper<ProgramSession>();
const sessionSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  track_id: z.string().optional(),
  format_id: z.string().optional(),
  duration_minutes: z.coerce.number().int().positive().optional(),
  capacity: z.coerce.number().int().min(0).optional(),
  ceu_credits: z.coerce.number().min(0).optional(),
  language: z.string().optional(),
  location: z.string().optional(),
  participants: z.array(participantInputSchema).optional(),
});
type SessionFormValues = z.infer<typeof sessionSchema>;

export function SessionsListPage() {
  const { eventId } = useCurrentEvent();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: sessions = [], isLoading } = useQuery({ queryKey: ["sessions", eventId], queryFn: () => sessionsApi.list(eventId) });
  const { data: tracks = [] } = useQuery({ queryKey: ["tracks", eventId], queryFn: () => programApi.tracks.list(eventId) });
  const { data: formats = [] } = useQuery({ queryKey: ["formats", eventId], queryFn: () => programApi.formats.list(eventId) });

  const form = useForm<SessionFormValues>({ resolver: zodResolver(sessionSchema), defaultValues: { title: "", participants: [] } });
  const create = useMutation({
    mutationFn: (values: SessionFormValues) => sessionsApi.create(eventId, values),
    onSuccess: () => {
      toast.success("Session created");
      setOpen(false);
      form.reset({ title: "", participants: [] });
      void queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not create session"),
  });

  const columns = [
    columnHelper.accessor("title", { header: "Title" }),
    columnHelper.accessor("status", { header: "Status", cell: (info) => <StatusPill label={info.getValue()} tone={SESSION_STATUS_TONE[info.getValue()] ?? "neutral"} /> }),
    columnHelper.accessor("room_name", { header: "Room", cell: (info) => info.getValue() ?? "Unscheduled" }),
    columnHelper.accessor("starts_at", { header: "Start", cell: (info) => (info.getValue() ? new Date(info.getValue()!).toLocaleString() : "—") }),
    columnHelper.accessor("duration_minutes", { header: "Duration", cell: (info) => (info.getValue() ? `${info.getValue()} min` : "—") }),
    columnHelper.accessor((row) => row.participants.length, { id: "speakers", header: "Speakers" }),
  ];

  return (
    <div>
      <PageHeader
        icon={ListChecks}
        title="Sessions"
        subtitle="Accepted abstracts converted to sessions, plus manually created sessions."
        actions={
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            Add Session
          </button>
        }
      />
      <div className="px-6 py-6">
        <DataTable
          columns={columns}
          data={sessions}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          searchPlaceholder="Search sessions..."
          emptyTitle="No sessions yet"
          savedViews={{ eventId, resourceType: "sessions" }}
          onRowClick={(row) => navigate(`/app/events/${eventId}/sessions/${row.id}`)}
        />
      </div>

      <DrawerForm open={open} onOpenChange={setOpen} title="Add Session" onSubmit={form.handleSubmit((v) => create.mutate(v))} isSubmitting={create.isPending} submitLabel="Create">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input {...form.register("title")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Track</Label>
              <Select value={form.watch("track_id")} onValueChange={(v) => form.setValue("track_id", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {tracks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <Select value={form.watch("format_id")} onValueChange={(v) => form.setValue("format_id", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {formats.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Duration (minutes)</Label>
            <Input type="number" {...form.register("duration_minutes")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Capacity</Label>
              <Input type="number" {...form.register("capacity")} />
            </div>
            <div className="space-y-1.5">
              <Label>CEU Credits</Label>
              <Input type="number" step="0.1" {...form.register("ceu_credits")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Language</Label>
            <Input {...form.register("language")} />
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input {...form.register("location")} />
          </div>
          <div className="space-y-1.5">
            <Label>Participants</Label>
            <ParticipantListEditor
              value={form.watch("participants") ?? []}
              onChange={(v) => form.setValue("participants", v as SessionFormValues["participants"])}
            />
          </div>
        </div>
      </DrawerForm>
    </div>
  );
}
