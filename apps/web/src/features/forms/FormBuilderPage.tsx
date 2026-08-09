import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import {
  Sparkles,
  FileText,
  Presentation,
  Users,
  GitBranch,
  Settings2,
  Mail,
  Plus,
  Trash2,
  GripVertical,
  Eye,
  Link as LinkIcon,
  Copy,
  Lock,
  Ellipsis,
  Check,
} from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "@opensession/ui";
import { toast } from "sonner";
import type { FieldConfig, ParticipantRoleConfig, SectionConfig, SubmissionFormInput } from "@opensession/schemas";
import { formsApi, programApi, evaluationsApi, ApiError } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { WizardShell, type WizardStep } from "../../components/wizard-shell";
import { ConditionalRuleEditor, RoutingRuleEditor } from "./RuleBuilder";
import { DynamicForm } from "./DynamicForm";
import { RichTextEditor } from "../../components/rich-text-editor";

const STEPS: WizardStep[] = [
  { key: "setup", label: "Submission Setup", description: "Submission type and participants", icon: Sparkles },
  { key: "details", label: "Public Details", description: "Title, slug", icon: FileText },
  { key: "fields", label: "Submission Fields", description: "Questions submitters answer", icon: FileText },
  { key: "participants", label: "Participant Roles", description: "Who can be added, and how many", icon: Users },
  { key: "logic", label: "Logic & Routing", description: "Conditional fields and routing", icon: GitBranch },
  { key: "settings", label: "Form Settings", description: "Deadlines, limits, success page", icon: Settings2 },
  { key: "notifications", label: "Notifications", description: "Confirmation email", icon: Mail },
];

const FIELD_TYPES = ["short_text", "long_text", "number", "url", "email", "dropdown", "multi_select", "radio", "checkbox", "date", "file"];

/** Display type shown on the secondary line of a field row (matching the
 * reference's "Text" / "Wysiwyg" / "Dropdown" labels). System fields don't
 * carry a real field_type (they're all "system"), so their widget is inferred
 * from which system_field they back. */
const FIELD_TYPE_LABELS: Record<string, string> = {
  short_text: "Text",
  long_text: "Wysiwyg",
  number: "Number",
  url: "URL",
  email: "Email",
  dropdown: "Dropdown",
  multi_select: "Multi-select",
  radio: "Radio",
  checkbox: "Checkbox",
  date: "Date",
  file: "File",
};

const SYSTEM_FIELD_TYPE_LABELS: Record<string, string> = {
  title: "Text",
  description: "Wysiwyg",
  format: "Dropdown",
  track: "Dropdown",
  tags: "Dropdown",
  level: "Dropdown",
};

function fieldTypeLabel(field: FieldConfig): string {
  if (field.field_type === "system") return SYSTEM_FIELD_TYPE_LABELS[field.system_field ?? ""] ?? "Text";
  return FIELD_TYPE_LABELS[field.field_type ?? ""] ?? field.field_type ?? "Text";
}

const SYSTEM_FIELDS: FieldConfig[] = [
  { key: "title", label: "Title", field_type: "system", system_field: "title", required: true },
  { key: "description", label: "Description", field_type: "system", system_field: "description", required: true },
  { key: "format", label: "Format", field_type: "system", system_field: "format", required: false },
  { key: "track", label: "Track", field_type: "system", system_field: "track", required: false },
  { key: "tags", label: "Tags", field_type: "system", system_field: "tags", required: false },
  { key: "level", label: "Level", field_type: "system", system_field: "level", required: false },
];

function emptyDraft(): SubmissionFormInput {
  return {
    internal_name: "",
    public_title: "Welcome to our event!",
    slug: "cfp",
    submission_type: "abstract",
    participant_roles: [{ role: "speaker", min: 1, max: 1 }],
    sections: [{ key: "proposal", title: "Tell us about your submission", fields: [...SYSTEM_FIELDS] }],
    conditional_rules: [],
    routing_rules: [],
    allow_multiple: false,
    allow_drafts: true,
    auto_redirect_portal: true,
    success_message_html: "<p>Thanks for submitting! We'll be in touch after review.</p>",
  };
}

export function FormBuilderPage() {
  const { eventId, event } = useCurrentEvent();
  const { formId } = useParams<{ formId: string }>();
  const isNew = !formId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState("setup");
  const [draft, setDraft] = useState<SubmissionFormInput>(emptyDraft());
  const [previewOpen, setPreviewOpen] = useState(true);

  const { data: existing } = useQuery({
    queryKey: ["forms", "detail", formId],
    queryFn: () => formsApi.get(formId!),
    enabled: Boolean(formId),
  });
  useEffect(() => {
    if (existing) {
      setDraft({
        internal_name: existing.internal_name,
        public_title: existing.public_title,
        slug: existing.slug,
        submission_type: existing.submission_type,
        participant_roles: existing.participant_roles,
        sections: existing.sections,
        conditional_rules: existing.conditional_rules,
        routing_rules: existing.routing_rules,
        open_at: existing.open_at,
        close_at: existing.close_at,
        submission_limit: existing.submission_limit,
        allow_multiple: existing.allow_multiple,
        allow_drafts: existing.allow_drafts,
        auto_redirect_portal: existing.auto_redirect_portal,
        success_message_html: existing.success_message_html,
      });
    }
  }, [existing]);

  const { data: tracks = [] } = useQuery({ queryKey: ["tracks", eventId], queryFn: () => programApi.tracks.list(eventId) });
  const { data: formats = [] } = useQuery({ queryKey: ["formats", eventId], queryFn: () => programApi.formats.list(eventId) });
  const { data: tags = [] } = useQuery({ queryKey: ["tags", eventId], queryFn: () => programApi.tags.list(eventId) });
  const { data: plans = [] } = useQuery({ queryKey: ["evaluation-plans", eventId], queryFn: () => evaluationsApi.list(eventId) });

  const save = useMutation({
    mutationFn: () => (isNew ? formsApi.create(eventId, draft) : formsApi.update(formId!, draft)),
    onSuccess: (form) => {
      toast.success("Form saved");
      void queryClient.invalidateQueries({ queryKey: ["forms", eventId] });
      if (isNew) navigate(`/app/events/${eventId}/forms/${form.id}/edit`, { replace: true });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save form"),
  });

  const publish = useMutation({
    mutationFn: () => formsApi.publish(formId!),
    onSuccess: () => {
      toast.success("Form is now open");
      void queryClient.invalidateQueries({ queryKey: ["forms", eventId] });
    },
  });

  const section = draft.sections?.[0] ?? { key: "proposal", title: "", fields: [] };
  function updateSection(patch: Partial<SectionConfig>) {
    setDraft((d) => ({ ...d, sections: [{ ...section, ...patch }] }));
  }
  function updateField(index: number, patch: Partial<FieldConfig>) {
    const fields = [...(section.fields ?? [])];
    fields[index] = { ...fields[index]!, ...patch };
    updateSection({ fields });
  }
  function addField() {
    const fields = [...(section.fields ?? []), { key: `field_${Date.now()}`, label: "New field", field_type: "short_text", required: false } as FieldConfig];
    updateSection({ fields });
  }
  function removeField(index: number) {
    updateSection({ fields: (section.fields ?? []).filter((_, i) => i !== index) });
  }

  const fieldOptions = (section.fields ?? []).map((f) => ({ key: f.key, label: f.label }));

  return (
    <WizardShell
      title={isNew ? "Create Form" : "Edit Form"}
      subtitle={draft.internal_name || undefined}
      backHref={`/app/events/${eventId}/forms`}
      backLabel="Back to forms"
      steps={STEPS}
      activeStep={step}
      onStepChange={setStep}
      contentWidth={previewOpen ? "wide" : "form"}
      headerActions={
        <>
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen((v) => !v)}>
            <Eye className="h-4 w-4" />
            {previewOpen ? "Hide preview" : "Preview"}
          </Button>
          {!isNew && existing && event?.slug && (
            <>
              {/* The route is /submit/:eventSlug/:formSlug — linking with the
                  event *id* here produced a 404 on the one URL organizers hand
                  to speakers. */}
              <Button variant="outline" size="sm" asChild>
                <a href={`/submit/${event.slug}/${draft.slug}`} target="_blank" rel="noreferrer">
                  <LinkIcon className="h-4 w-4" />
                  View public form
                </a>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const url = `${window.location.origin}/submit/${event.slug}/${draft.slug}`;
                  void navigator.clipboard.writeText(url).then(
                    () => toast.success("Public form link copied"),
                    () => toast.error(url),
                  );
                }}
              >
                <Copy className="h-4 w-4" />
                Copy link
              </Button>
            </>
          )}
          {!isNew && existing?.status !== "open" && (
            <Button variant="outline" size="sm" onClick={() => publish.mutate()}>
              Publish
            </Button>
          )}
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            Save
          </Button>
        </>
      }
      footer={
        <>
          <Button
            variant="outline"
            disabled={step === "setup"}
            onClick={() => setStep(STEPS[Math.max(0, STEPS.findIndex((s) => s.key === step) - 1)]!.key)}
          >
            Back
          </Button>
          <Button
            disabled={step === "notifications"}
            onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, STEPS.findIndex((s) => s.key === step) + 1)]!.key)}
          >
            Next
          </Button>
        </>
      }
    >
      <div className={previewOpen ? "grid gap-6 xl:grid-cols-2" : ""}>
        <div className="space-y-6">
          <StepHeader step={STEPS.find((s) => s.key === step)} />

          {step === "setup" && (
            <div className="space-y-6">
              <div className="space-y-1.5">
                <Label>Internal form name</Label>
                <Input value={draft.internal_name} onChange={(e) => setDraft((d) => ({ ...d, internal_name: e.target.value }))} placeholder="Session Submission Form" />
              </div>

              <div className="space-y-2">
                <h3 className="text-base font-semibold text-foreground">What kind of submissions do you want to collect?</h3>
                <p className="text-sm text-muted-foreground">Choose what submitters will send and whether to collect participant details.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <TypeCard
                  icon={FileText}
                  title="Abstracts"
                  description="Collect abstract submissions for review before sessions are finalized."
                  selected={draft.submission_type === "abstract"}
                  onClick={() => setDraft((d) => ({ ...d, submission_type: "abstract" }))}
                />
                <TypeCard
                  icon={Presentation}
                  title="Sessions"
                  description="Collect full session proposals with details for your program."
                  selected={draft.submission_type === "session"}
                  onClick={() => setDraft((d) => ({ ...d, submission_type: "session" }))}
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-xs">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Users className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Participants</p>
                    <p className="text-[13px] leading-5 text-muted-foreground">
                      Include a step to collect speaker and participant contact information.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={(draft.participant_roles?.length ?? 0) > 0}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, participant_roles: v ? [{ role: "speaker", min: 1, max: 1 }] : [] }))}
                />
              </div>
            </div>
          )}

          {step === "details" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Public title</Label>
                <Input value={draft.public_title} onChange={(e) => setDraft((d) => ({ ...d, public_title: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input value={draft.slug} onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))} />
                <p className="text-xs text-muted-foreground">/submit/{"{event-slug}"}/{draft.slug || "..."}</p>
              </div>
            </div>
          )}

          {step === "fields" && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label>Section title</Label>
                <Input value={section.title} onChange={(e) => updateSection({ title: e.target.value })} />
              </div>
              <div className="flex items-center justify-between border-t border-border pt-4">
                <h3 className="text-base font-semibold text-foreground">Form Questions</h3>
                <Button size="sm" variant="outline" onClick={addField}>
                  <Plus className="h-4 w-4" />
                  Add Field
                </Button>
              </div>
              <div className="space-y-2.5">
                {(section.fields ?? []).map((field, index) => (
                  <FieldRow key={field.key} field={field} onChange={(patch) => updateField(index, patch)} onRemove={() => removeField(index)} />
                ))}
              </div>
            </div>
          )}

          {step === "participants" && (
            <div className="space-y-4">
              {(draft.participant_roles?.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground">
                  Participants are turned off for this form — enable them in Submission Setup to collect speaker roles here.
                </p>
              )}
              {(draft.participant_roles ?? []).map((role, index) => (
                <RoleRow
                  key={index}
                  role={role}
                  onChange={(patch) => {
                    const roles = [...(draft.participant_roles ?? [])];
                    roles[index] = { ...roles[index]!, ...patch };
                    setDraft((d) => ({ ...d, participant_roles: roles }));
                  }}
                  onRemove={() => setDraft((d) => ({ ...d, participant_roles: (d.participant_roles ?? []).filter((_, i) => i !== index) }))}
                />
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDraft((d) => ({ ...d, participant_roles: [...(d.participant_roles ?? []), { role: "co-speaker", min: 0, max: 3 }] }))}
              >
                <Plus className="h-4 w-4" />
                Add role
              </Button>
            </div>
          )}

          {step === "logic" && (
            <div className="space-y-8">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Conditional field rules</h3>
                <ConditionalRuleEditor rules={draft.conditional_rules ?? []} onChange={(rules) => setDraft((d) => ({ ...d, conditional_rules: rules }))} fieldOptions={fieldOptions} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Category routing rules</h3>
                <RoutingRuleEditor
                  rules={draft.routing_rules ?? []}
                  onChange={(rules) => setDraft((d) => ({ ...d, routing_rules: rules }))}
                  fieldOptions={fieldOptions}
                  trackOptions={tracks.map((t) => ({ key: t.id, label: t.name }))}
                  tagOptions={tags.map((t) => ({ key: t.id, label: t.name }))}
                  planOptions={plans.map((p) => ({ key: p.id, label: p.name }))}
                />
              </div>
            </div>
          )}

          {step === "settings" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Open date</Label>
                  <Input type="datetime-local" value={draft.open_at ?? ""} onChange={(e) => setDraft((d) => ({ ...d, open_at: e.target.value || null }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Close date</Label>
                  <Input type="datetime-local" value={draft.close_at ?? ""} onChange={(e) => setDraft((d) => ({ ...d, close_at: e.target.value || null }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Submission limit per account</Label>
                <Input type="number" value={draft.submission_limit ?? ""} onChange={(e) => setDraft((d) => ({ ...d, submission_limit: e.target.value ? Number(e.target.value) : null }))} />
              </div>
              <ToggleRow label="Allow multiple submissions" checked={Boolean(draft.allow_multiple)} onChange={(v) => setDraft((d) => ({ ...d, allow_multiple: v }))} />
              <ToggleRow label="Allow saved drafts" checked={Boolean(draft.allow_drafts)} onChange={(v) => setDraft((d) => ({ ...d, allow_drafts: v }))} />
              <ToggleRow label="Auto-redirect to speaker portal after submit" checked={Boolean(draft.auto_redirect_portal)} onChange={(v) => setDraft((d) => ({ ...d, auto_redirect_portal: v }))} />
              <div className="space-y-1.5">
                <Label>Success page message</Label>
                <RichTextEditor value={draft.success_message_html ?? ""} onChange={(html) => setDraft((d) => ({ ...d, success_message_html: html }))} />
              </div>
            </div>
          )}

          {step === "notifications" && (
            <div className="space-y-4">
              <div className="rounded-md border border-border p-3">
                <p className="text-sm font-medium text-foreground">Submission confirmation — required</p>
                <p className="text-xs text-muted-foreground">
                  Every submitter automatically receives a confirmation email on submit. Customize the template under
                  Communications → Templates &amp; Automations.
                </p>
              </div>
            </div>
          )}
        </div>

        {previewOpen && (
          <div className="xl:sticky xl:top-[4.75rem] xl:self-start">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.055em] text-muted-foreground/80">
              Live preview
            </p>
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">{draft.public_title}</h2>
              <div className="mt-4">
                <DynamicForm
                  sections={draft.sections ?? []}
                  rules={draft.conditional_rules ?? []}
                  answers={{}}
                  onChange={() => {}}
                  options={{ tracks, formats, tags }}
                  disabled
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </WizardShell>
  );
}

function FieldRow({ field, onChange, onRemove }: { field: FieldConfig; onChange: (patch: Partial<FieldConfig>) => void; onRemove: () => void }) {
  const locked = field.field_type === "system";
  const hasOptions = ["dropdown", "multi_select", "radio", "checkbox"].includes(field.field_type ?? "");
  return (
    <div className="group rounded-lg border border-border bg-card p-3 shadow-xs transition-[border-color,box-shadow] hover:border-foreground/15 hover:shadow-sm">
      <div className="flex items-center gap-3">
        <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <input
              value={field.label}
              onChange={(e) => onChange({ label: e.target.value })}
              aria-label="Field label"
              // field-sizing-content makes the input hug its text so the "*" and
              // Locked badge sit next to the name instead of drifting right.
              className="min-w-0 max-w-[26ch] flex-none truncate rounded-sm bg-transparent px-0.5 text-sm font-medium text-foreground outline-none field-sizing-content focus:bg-accent focus:ring-1 focus:ring-ring/40"
            />
            {field.required && <span className="shrink-0 text-destructive">*</span>}
            {locked && (
              <Badge variant="outline" className="shrink-0 gap-1 font-normal">
                <Lock />
                Locked
              </Badge>
            )}
            <span className="flex-1" />
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            {locked ? (
              <span className="text-xs text-muted-foreground">{fieldTypeLabel(field)}</span>
            ) : (
              <Select value={field.field_type} onValueChange={(v) => onChange({ field_type: v })}>
                <SelectTrigger className="h-6 w-auto gap-1 rounded-md border-transparent bg-transparent px-1 py-0 text-xs text-muted-foreground shadow-none hover:bg-accent hover:text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {FIELD_TYPE_LABELS[t] ?? t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {field.max_length ? (
              <Badge variant="muted" className="font-normal tabular">
                Max {field.max_length}
              </Badge>
            ) : null}
          </div>
        </div>

        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          Required
          <Switch checked={Boolean(field.required)} onCheckedChange={(v) => onChange({ required: v })} />
        </label>

        {/* Locked rows keep an equal-width spacer so every row's toggle column
            lines up, instead of the system rows shifting right by a button. */}
        {locked ? (
          <span aria-hidden className="size-8 shrink-0" />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" aria-label="Field options">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem destructive onSelect={onRemove}>
                <Trash2 />
                Delete field
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {hasOptions && (
        <div className="mt-3 border-t border-border pt-3 pl-7">
          <Label className="mb-1.5 text-xs text-muted-foreground">Options</Label>
          <Input
            className="h-8"
            placeholder="Comma-separated, e.g. Beginner, Intermediate, Advanced"
            value={(field.options ?? []).join(", ")}
            onChange={(e) => onChange({ options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
          />
        </div>
      )}
    </div>
  );
}

function RoleRow({ role, onChange, onRemove }: { role: ParticipantRoleConfig; onChange: (patch: Partial<ParticipantRoleConfig>) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border p-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Check className="h-4 w-4" />
      </span>
      <Input value={role.role} onChange={(e) => onChange({ role: e.target.value })} className="h-8 min-w-0 flex-1" placeholder="Role name" />
      <div className="shrink-0 space-y-1">
        <p className="text-[11px] text-muted-foreground">Min</p>
        <Input type="number" value={role.min ?? 0} onChange={(e) => onChange({ min: Number(e.target.value) })} className="h-8 w-14 px-2" />
      </div>
      <div className="shrink-0 space-y-1">
        <p className="text-[11px] text-muted-foreground">Max</p>
        <Input type="number" value={role.max ?? 1} onChange={(e) => onChange({ max: Number(e.target.value) })} className="h-8 w-14 px-2" />
      </div>
      <Button type="button" variant="ghost" size="icon" className="shrink-0 self-end" onClick={onRemove}>
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border p-3">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Bordered info box shown at the top of every step's content — matches the
 * reference's "Submission Setup / Submission type and participants" header. */
function StepHeader({ step }: { step?: WizardStep }) {
  if (!step) return null;
  return (
    <div className="border-b border-border pb-4">
      <h2 className="text-lg font-semibold text-foreground">{step.label}</h2>
      {step.description && <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>}
    </div>
  );
}

function TypeCard({
  icon: Icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "relative flex flex-col items-center gap-2.5 rounded-xl border bg-card p-5 text-center",
        "transition-[border-color,box-shadow,background-color] duration-150",
        "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35",
        selected
          ? "border-primary shadow-sm ring-1 ring-primary/25"
          : "border-border shadow-xs hover:border-foreground/20 hover:shadow-sm",
      )}
    >
      {selected && (
        <span className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" />
        </span>
      )}
      <span
        className={cn(
          "flex size-11 items-center justify-center rounded-xl transition-colors",
          selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="text-[15px] font-semibold text-foreground">{title}</span>
      <span className="text-[13px] leading-5 text-muted-foreground">{description}</span>
    </button>
  );
}
