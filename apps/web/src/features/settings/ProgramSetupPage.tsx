import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import {
  Button,
  Input,
  Label,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@opensession/ui";
import { toast } from "sonner";
import type { z } from "zod";
import { formatSchema, roomSchema, tagSchema, trackSchema } from "@opensession/schemas";
import type { Room, SessionFormat, Tag, Track } from "@opensession/schemas";
import { programApi, ApiError } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { PageHeader } from "../../layouts/organizer-shell";
import { DrawerForm } from "../../components/drawer-form";
import { EmptyState } from "../../components/empty-state";
import { SlidersHorizontal, Tag as TagIcon, DoorOpen, LayoutList, type LucideIcon } from "lucide-react";

type TrackFormValues = z.infer<typeof trackSchema>;
type RoomFormValues = z.infer<typeof roomSchema>;
type FormatFormValues = z.infer<typeof formatSchema>;
type TagFormValues = z.infer<typeof tagSchema>;

export function ProgramSetupPage() {
  const { eventId } = useCurrentEvent();
  return (
    <div>
      <PageHeader icon={SlidersHorizontal} title="Program Setup" subtitle="Tracks, rooms, session formats, and tags shared across the event." />
      <div className="px-6 py-6">
        <Tabs defaultValue="tracks">
          <TabsList>
            <TabsTrigger value="tracks">Tracks</TabsTrigger>
            <TabsTrigger value="rooms">Rooms</TabsTrigger>
            <TabsTrigger value="formats">Session Formats</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
          </TabsList>
          <TabsContent value="tracks" className="mt-4">
            <TracksPanel eventId={eventId} />
          </TabsContent>
          <TabsContent value="rooms" className="mt-4">
            <RoomsPanel eventId={eventId} />
          </TabsContent>
          <TabsContent value="formats" className="mt-4">
            <FormatsPanel eventId={eventId} />
          </TabsContent>
          <TabsContent value="tags" className="mt-4">
            <TagsPanel eventId={eventId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SectionShell({
  icon: Icon,
  addLabel,
  onAdd,
  isEmpty,
  emptyLabel,
  children,
}: {
  icon: LucideIcon;
  addLabel: string;
  onAdd: () => void;
  isEmpty: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          {addLabel}
        </Button>
      </div>
      {isEmpty ? <EmptyState icon={Icon} title={emptyLabel} /> : <div className="divide-y divide-border rounded-lg border border-border">{children}</div>}
    </div>
  );
}

function TracksPanel({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Track | "new" | null>(null);
  const { data = [] } = useQuery({ queryKey: ["tracks", eventId], queryFn: () => programApi.tracks.list(eventId) });

  const form = useForm<TrackFormValues>({ resolver: zodResolver(trackSchema), defaultValues: { name: "", description: "", color: "", serial_schedule: false, active: true } });

  function openEdit(track: Track | "new") {
    setEditing(track);
    if (track === "new") form.reset({ name: "", description: "", color: "", serial_schedule: false, active: true });
    else form.reset({ name: track.name, description: track.description ?? "", color: track.color ?? "", serial_schedule: track.serial_schedule, active: track.active });
  }

  const save = useMutation({
    mutationFn: async (values: TrackFormValues) => {
      if (editing === "new") return programApi.tracks.create(eventId, values);
      return programApi.tracks.update(eventId, (editing as Track).id, values);
    },
    onSuccess: () => {
      toast.success("Track saved");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["tracks", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save track"),
  });

  return (
    <>
      <SectionShell icon={SlidersHorizontal} addLabel="Add track" onAdd={() => openEdit("new")} isEmpty={data.length === 0} emptyLabel="No tracks yet">
        {data.map((track) => (
          <button key={track.id} onClick={() => openEdit(track)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-secondary/50">
            <div>
              <p className="text-sm font-medium text-foreground">{track.name}</p>
              {track.description ? <p className="text-xs text-muted-foreground">{track.description}</p> : null}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {track.serial_schedule ? <span>Serial</span> : null}
              {!track.active ? <span className="text-warning">Inactive</span> : null}
            </div>
          </button>
        ))}
      </SectionShell>
      <DrawerForm
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Add track" : "Edit track"}
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        isSubmitting={save.isPending}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input {...form.register("name")} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={3} {...form.register("description")} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label>Serial schedule</Label>
              <p className="text-xs text-muted-foreground">Sessions in this track shouldn't overlap each other.</p>
            </div>
            <Switch checked={form.watch("serial_schedule")} onCheckedChange={(v) => form.setValue("serial_schedule", v)} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <Label>Active</Label>
            <Switch checked={form.watch("active")} onCheckedChange={(v) => form.setValue("active", v)} />
          </div>
        </div>
      </DrawerForm>
    </>
  );
}

function RoomsPanel({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Room | "new" | null>(null);
  const { data = [] } = useQuery({ queryKey: ["rooms", eventId], queryFn: () => programApi.rooms.list(eventId) });
  const form = useForm<RoomFormValues>({ resolver: zodResolver(roomSchema), defaultValues: { name: "", location: "", capacity: undefined, notes: "" } });

  function openEdit(room: Room | "new") {
    setEditing(room);
    if (room === "new") form.reset({ name: "", location: "", capacity: undefined, notes: "" });
    else form.reset({ name: room.name, location: room.location ?? "", capacity: room.capacity ?? undefined, notes: room.notes ?? "" });
  }

  const save = useMutation({
    mutationFn: async (values: RoomFormValues) => {
      if (editing === "new") return programApi.rooms.create(eventId, values);
      return programApi.rooms.update(eventId, (editing as Room).id, values);
    },
    onSuccess: () => {
      toast.success("Room saved");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["rooms", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save room"),
  });

  return (
    <>
      <SectionShell icon={DoorOpen} addLabel="Add room" onAdd={() => openEdit("new")} isEmpty={data.length === 0} emptyLabel="No rooms yet">
        {data.map((room) => (
          <button key={room.id} onClick={() => openEdit(room)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-secondary/50">
            <div>
              <p className="text-sm font-medium text-foreground">{room.name}</p>
              {room.location ? <p className="text-xs text-muted-foreground">{room.location}</p> : null}
            </div>
            {room.capacity ? <span className="text-xs text-muted-foreground">Capacity {room.capacity}</span> : null}
          </button>
        ))}
      </SectionShell>
      <DrawerForm
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Add room" : "Edit room"}
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        isSubmitting={save.isPending}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input {...form.register("name")} />
          </div>
          <div className="space-y-1.5">
            <Label>Location / floor</Label>
            <Input {...form.register("location")} />
          </div>
          <div className="space-y-1.5">
            <Label>Capacity</Label>
            <Input type="number" {...form.register("capacity")} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={3} {...form.register("notes")} />
          </div>
        </div>
      </DrawerForm>
    </>
  );
}

function FormatsPanel({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SessionFormat | "new" | null>(null);
  const { data = [] } = useQuery({ queryKey: ["formats", eventId], queryFn: () => programApi.formats.list(eventId) });
  const form = useForm<FormatFormValues>({ resolver: zodResolver(formatSchema), defaultValues: { name: "", default_duration_minutes: undefined } });

  function openEdit(format: SessionFormat | "new") {
    setEditing(format);
    if (format === "new") form.reset({ name: "", default_duration_minutes: undefined });
    else form.reset({ name: format.name, default_duration_minutes: format.default_duration_minutes ?? undefined });
  }

  const save = useMutation({
    mutationFn: async (values: FormatFormValues) => {
      if (editing === "new") return programApi.formats.create(eventId, values);
      return programApi.formats.update(eventId, (editing as SessionFormat).id, values);
    },
    onSuccess: () => {
      toast.success("Format saved");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["formats", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save format"),
  });

  return (
    <>
      <SectionShell icon={LayoutList} addLabel="Add format" onAdd={() => openEdit("new")} isEmpty={data.length === 0} emptyLabel="No formats yet">
        {data.map((format) => (
          <button key={format.id} onClick={() => openEdit(format)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-secondary/50">
            <p className="text-sm font-medium text-foreground">{format.name}</p>
            {format.default_duration_minutes ? <span className="text-xs text-muted-foreground">{format.default_duration_minutes} min</span> : null}
          </button>
        ))}
      </SectionShell>
      <DrawerForm
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Add format" : "Edit format"}
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        isSubmitting={save.isPending}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input {...form.register("name")} />
          </div>
          <div className="space-y-1.5">
            <Label>Default duration (minutes)</Label>
            <Input type="number" {...form.register("default_duration_minutes")} />
          </div>
        </div>
      </DrawerForm>
    </>
  );
}

function TagsPanel({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Tag | "new" | null>(null);
  const { data = [] } = useQuery({ queryKey: ["tags", eventId], queryFn: () => programApi.tags.list(eventId) });
  const form = useForm<TagFormValues>({ resolver: zodResolver(tagSchema), defaultValues: { name: "" } });

  function openEdit(tag: Tag | "new") {
    setEditing(tag);
    form.reset({ name: tag === "new" ? "" : tag.name });
  }

  const save = useMutation({
    mutationFn: async (values: TagFormValues) => {
      if (editing === "new") return programApi.tags.create(eventId, values);
      return programApi.tags.update(eventId, (editing as Tag).id, values);
    },
    onSuccess: () => {
      toast.success("Tag saved");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["tags", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save tag"),
  });

  return (
    <>
      <SectionShell icon={TagIcon} addLabel="Add tag" onAdd={() => openEdit("new")} isEmpty={data.length === 0} emptyLabel="No tags yet">
        {data.map((tag) => (
          <button key={tag.id} onClick={() => openEdit(tag)} className="flex w-full items-center px-4 py-3 text-left hover:bg-secondary/50">
            <p className="text-sm font-medium text-foreground">{tag.name}</p>
          </button>
        ))}
      </SectionShell>
      <DrawerForm
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Add tag" : "Edit tag"}
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        isSubmitting={save.isPending}
      >
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input {...form.register("name")} />
        </div>
      </DrawerForm>
    </>
  );
}
