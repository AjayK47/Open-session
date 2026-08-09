import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { Button, Input, Label } from "@opensession/ui";
import { toast } from "sonner";
import type { EmailTemplate } from "@opensession/schemas";
import { communicationsApi, ApiError } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { PageHeader } from "../../layouts/organizer-shell";
import { RichTextEditor } from "../../components/rich-text-editor";
import { CommsSubNav } from "./CommsSubNav";

const MERGE_VARS = [
  "{{speaker.first_name}}",
  "{{speaker.full_name}}",
  "{{event.name}}",
  "{{event.start_date}}",
  "{{submission.title}}",
  "{{session.title}}",
  "{{session.start_time}}",
  "{{session.room}}",
  "{{task.name}}",
  "{{task.due_date}}",
  "{{portal_url}}",
];

export function TemplatesPage() {
  const { eventId } = useCurrentEvent();
  const queryClient = useQueryClient();
  const { data: templates = [] } = useQuery({ queryKey: ["email-templates", eventId], queryFn: () => communicationsApi.listTemplates(eventId) });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = templates.find((t) => t.id === selectedId) ?? templates[0];

  const [draft, setDraft] = useState<EmailTemplate | null>(null);
  useEffect(() => {
    if (selected) setDraft(selected);
  }, [selected?.id]);

  const save = useMutation({
    mutationFn: () =>
      communicationsApi.updateTemplate(draft!.id, {
        subject_template: draft!.subject_template,
        html_template: draft!.html_template,
        text_template: draft!.text_template,
      }),
    onSuccess: () => {
      toast.success("Template saved");
      void queryClient.invalidateQueries({ queryKey: ["email-templates", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save template"),
  });

  return (
    <div>
      <PageHeader
        icon={Mail}
        title="Templates & Automations"
        subtitle="Email content and automated triggers."
        actions={<CommsSubNav eventId={eventId} active="templates" />}
      />
      <div className="grid grid-cols-[220px_1fr] gap-6 px-6 py-6">
        <div className="space-y-1">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm ${(selected?.id === t.id) ? "bg-accent font-medium text-accent-foreground" : "hover:bg-secondary"}`}
            >
              {t.name}
            </button>
          ))}
        </div>

        {draft && (
          <div className="max-w-2xl space-y-4">
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input value={draft.subject_template} onChange={(e) => setDraft({ ...draft, subject_template: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Body</Label>
              <RichTextEditor value={draft.html_template} onChange={(html) => setDraft({ ...draft, html_template: html })} />
            </div>
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Merge variables</p>
              <div className="flex flex-wrap gap-1.5">
                {MERGE_VARS.map((v) => (
                  <code key={v} className="rounded bg-secondary px-1.5 py-0.5 text-xs">
                    {v}
                  </code>
                ))}
              </div>
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save template
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
