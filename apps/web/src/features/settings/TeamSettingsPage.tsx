import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { UsersRound, Trash2, Plus } from "lucide-react";
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@opensession/ui";
import { toast } from "sonner";
import { memberSchema } from "@opensession/schemas";
import { teamApi, ApiError } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { PageHeader } from "../../layouts/organizer-shell";
import { DrawerForm } from "../../components/drawer-form";
import { EmptyState } from "../../components/empty-state";

export function TeamSettingsPage() {
  const { eventId } = useCurrentEvent();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({ queryKey: ["team", eventId], queryFn: () => teamApi.list(eventId) });

  const form = useForm({ resolver: zodResolver(memberSchema), defaultValues: { email: "", role: "reviewer" as const } });

  const add = useMutation({
    mutationFn: (values: { email: string; role: "owner" | "admin" | "reviewer" | "speaker" }) => teamApi.add(eventId, values.email, values.role),
    onSuccess: () => {
      toast.success("Team member added");
      setOpen(false);
      form.reset({ email: "", role: "reviewer" });
      void queryClient.invalidateQueries({ queryKey: ["team", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not add member"),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => teamApi.remove(eventId, userId),
    onSuccess: () => {
      toast.success("Removed");
      void queryClient.invalidateQueries({ queryKey: ["team", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not remove member"),
  });

  return (
    <div>
      <PageHeader
        icon={UsersRound}
        title="Team"
        subtitle="Admins, reviewers, and speaker-liaison access for this event."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Add member
          </Button>
        }
      />
      <div className="px-6 py-6">
        {!isLoading && data.length === 0 ? (
          <EmptyState icon={UsersRound} title="No team members yet" description="Add admins or reviewers by email." />
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {data.map((member) => (
              <div key={member.user_id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{member.email}</p>
                  <p className="text-xs capitalize text-muted-foreground">{member.role}</p>
                </div>
                {member.role !== "owner" && (
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate(member.user_id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <DrawerForm
        open={open}
        onOpenChange={setOpen}
        title="Add team member"
        description="They'll be able to sign in with a magic code sent to this email."
        onSubmit={form.handleSubmit((v) => add.mutate(v))}
        isSubmitting={add.isPending}
        submitLabel="Add"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" {...form.register("email")} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={form.watch("role")} onValueChange={(v) => form.setValue("role", v as never)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="reviewer">Reviewer</SelectItem>
                <SelectItem value="speaker">Speaker</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </DrawerForm>
    </div>
  );
}
