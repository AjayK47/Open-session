import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Plus } from "lucide-react";
import { Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from "@opensession/ui";
import { toast } from "sonner";
import { automationSchema } from "@opensession/schemas";
import type { AutomationInput } from "@opensession/schemas";
import { communicationsApi, AUTOMATION_TRIGGERS, ApiError } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { PageHeader } from "../../layouts/organizer-shell";
import { CommsSubNav } from "./CommsSubNav";
import { DrawerForm } from "../../components/drawer-form";
import { EmptyState } from "../../components/empty-state";

export function AutomationsPage() {
  const { eventId } = useCurrentEvent();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: automations = [], isLoading } = useQuery({ queryKey: ["automations", eventId], queryFn: () => communicationsApi.listAutomations(eventId) });
  const { data: templates = [] } = useQuery({ queryKey: ["email-templates", eventId], queryFn: () => communicationsApi.listTemplates(eventId) });

  const form = useForm<AutomationInput>({ resolver: zodResolver(automationSchema), defaultValues: { trigger_type: AUTOMATION_TRIGGERS[0], enabled: true, include_calendar_invite: false } });

  const create = useMutation({
    mutationFn: (values: AutomationInput) => communicationsApi.createAutomation(eventId, values),
    onSuccess: () => {
      toast.success("Automation created");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["automations", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not create automation"),
  });

  const toggle = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) => communicationsApi.updateAutomation(input.id, { enabled: input.enabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["automations", eventId] }),
  });

  return (
    <div>
      <PageHeader icon={Mail} title="Templates & Automations" subtitle="Trigger → optional condition → template." actions={<CommsSubNav eventId={eventId} active="automations" />} />
      <div className="px-6 py-6">
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Add automation
          </Button>
        </div>
        {!isLoading && automations.length === 0 ? (
          <EmptyState icon={Mail} title="No automations yet" description="e.g. send a task reminder 2 days before it's due." />
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {automations.map((a) => {
              const template = templates.find((t) => t.id === a.template_id);
              return (
                <div key={a.id} className="flex items-center justify-between px-4 py-3">
                  <div className="text-sm">
                    <span className="font-medium capitalize text-foreground">{a.trigger_type.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground"> → {template?.name ?? "—"}</span>
                  </div>
                  <Switch checked={a.enabled} onCheckedChange={(v) => toggle.mutate({ id: a.id, enabled: v })} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <DrawerForm open={open} onOpenChange={setOpen} title="Add automation" onSubmit={form.handleSubmit((v) => create.mutate(v))} isSubmitting={create.isPending}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Trigger</Label>
            <Select value={form.watch("trigger_type")} onValueChange={(v) => form.setValue("trigger_type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTOMATION_TRIGGERS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select value={form.watch("template_id") ?? undefined} onValueChange={(v) => form.setValue("template_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <Label>Include calendar invite</Label>
            <Switch checked={Boolean(form.watch("include_calendar_invite"))} onCheckedChange={(v) => form.setValue("include_calendar_invite", v)} />
          </div>
        </div>
      </DrawerForm>
    </div>
  );
}
