import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarClock, FileText, Image as ImageIcon, Settings, Upload } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  IconChip,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
} from "@opensession/ui";
import { toast } from "sonner";
import { eventBasicsSchema } from "@opensession/schemas";
import type { Event } from "@opensession/schemas";
import { eventsApi, filesApi, ApiError } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { FileUploader } from "../../components/file-uploader";
import { Field, FieldError, ClearableDateTime } from "../../components/form-field";
import { PageHeader } from "../../layouts/page";
import { TIMEZONES } from "../../lib/timezones";

const EVENT_TYPES = [
  { value: "conference", label: "Conference" },
  { value: "summit", label: "Summit" },
  { value: "meetup", label: "Meetup" },
  { value: "other", label: "Other" },
];

const schema = eventBasicsSchema.partial({ starts_at: true, ends_at: true, name: true, slug: true, type: true, timezone: true });
type FormValues = z.infer<typeof schema>;

/** API dates arrive as full ISO strings (e.g. "2026-11-10T09:00:00Z"); a
 * datetime-local input only accepts "YYYY-MM-DDTHH:mm", so strip the rest. */
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.replace(/Z$/, "").slice(0, 16);
}

/** Loads the current event and, once available, mounts the form keyed by
 * event.id — a fresh instance per event, so react-hook-form's defaultValues
 * (and therefore every controlled Select) are correct from the very first
 * render instead of arriving a tick later via reset(). Radix's Select can't
 * cleanly transition from an unset value to a controlled one after mount, so
 * this sidesteps that entirely rather than fighting it. */
export function EventSettingsPage() {
  const { event, eventId } = useCurrentEvent();
  if (!event) return null;
  return <EventDetailsForm key={event.id} event={event} eventId={eventId} />;
}

function EventDetailsForm({ event, eventId }: { event: Event; eventId: string }) {
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: event.name,
      slug: event.slug,
      type: event.type,
      website_url: event.website_url ?? "",
      location: event.location ?? "",
      timezone: event.timezone,
      starts_at: toDatetimeLocal(event.starts_at),
      ends_at: toDatetimeLocal(event.ends_at),
      description: event.description ?? "",
    },
  });
  const [logoFileId, setLogoFileId] = useState<string | null>(event.logo_file_id);
  const [bannerFileId, setBannerFileId] = useState<string | null>(event.banner_file_id);

  const description = useWatch({ control: form.control, name: "description" }) ?? "";

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      eventsApi.update(eventId, {
        ...values,
        website_url: values.website_url || null,
        location: values.location || null,
        description: values.description || null,
        logo_file_id: logoFileId,
        banner_file_id: bannerFileId,
      }),
    onSuccess: () => {
      toast.success("Event settings saved");
      void queryClient.invalidateQueries({ queryKey: ["events", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save"),
  });
  // logoFileId/bannerFileId live outside react-hook-form (ImageSettingField
  // sets them directly via onChange), so isDirty alone never sees a branding
  // upload — the Save button stayed disabled and the upload was silently
  // lost the moment nothing else on the form also changed. Comparing against
  // the event's original file ids catches that case too.
  const dirty = form.formState.isDirty || logoFileId !== event.logo_file_id || bannerFileId !== event.banner_file_id;

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))}>
      <PageHeader
        icon={Settings}
        title="Event Settings"
        subtitle="Name, dates, timezone, and branding for this event."
        actions={
          <>
            <span
              className={cn(
                "hidden text-xs transition-colors sm:inline",
                dirty ? "text-warning" : "text-muted-foreground",
              )}
            >
              {dirty ? "Unsaved changes" : "All changes saved"}
            </span>
            <Button type="submit" disabled={save.isPending || !dirty}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-4 px-6 py-6">
        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0 border-b border-border">
            <IconChip tone="brand">
              <FileText />
            </IconChip>
            <div className="min-w-0">
              <CardTitle>Event details</CardTitle>
              <CardDescription>How this event is identified across the app and public pages.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-5 pt-5 md:grid-cols-2">
            <Field label="Event name" required>
              <Input {...form.register("name")} />
              {form.formState.errors.name && <FieldError message={form.formState.errors.name.message} />}
            </Field>
            <Field label="Event slug" required hint="Used in public URLs for this event.">
              <Input {...form.register("slug")} />
              {form.formState.errors.slug && <FieldError message={form.formState.errors.slug.message} />}
            </Field>

            <Field label="Event type" hint="How this event is categorized.">
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Website URL" hint="Where attendees can learn more.">
              <Input placeholder="https://example.com" {...form.register("website_url")} />
            </Field>

            <div className="space-y-1.5 md:col-span-2">
              <Label>Theme</Label>
              <p className="text-xs text-muted-foreground">
                A short description of what this event is about. Improves search and recommendations.
              </p>
              <Textarea rows={3} maxLength={1000} {...form.register("description")} />
              <p className="text-right text-xs tabular text-muted-foreground">{description.length} / 1000</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0 border-b border-border">
            <IconChip tone="warning">
              <CalendarClock />
            </IconChip>
            <div className="min-w-0">
              <CardTitle>Schedule &amp; location</CardTitle>
              <CardDescription>Every session is scheduled inside this window, in this timezone.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-5 pt-5 md:grid-cols-2">
            <Field label="Starts at" required hint="When the event begins.">
              <Controller
                control={form.control}
                name="starts_at"
                render={({ field }) => <ClearableDateTime value={field.value ?? ""} onChange={field.onChange} />}
              />
              {form.formState.errors.starts_at && <FieldError message={form.formState.errors.starts_at.message} />}
            </Field>
            <Field label="Ends at" required hint="When the event ends.">
              <Controller
                control={form.control}
                name="ends_at"
                render={({ field }) => <ClearableDateTime value={field.value ?? ""} onChange={field.onChange} />}
              />
              {form.formState.errors.ends_at && <FieldError message={form.formState.errors.ends_at.message} />}
            </Field>

            <Field label="Location" hint="City, venue, or 'Virtual'.">
              <Input {...form.register("location")} />
            </Field>
            <Field label="Timezone" hint="Used to schedule all sessions.">
              <Controller
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0 border-b border-border">
            <IconChip tone="success">
              <ImageIcon />
            </IconChip>
            <div className="min-w-0">
              <CardTitle>Branding</CardTitle>
              <CardDescription>Shown on the speaker portal and public submission pages.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 pt-5 md:grid-cols-2">
            <ImageSettingField
              label="Logo"
              hint="Square. Recommended 300 × 300."
              fileId={logoFileId}
              eventId={eventId}
              onChange={setLogoFileId}
            />
            <ImageSettingField
              label="Cover image"
              hint="Wide. Recommended 1500 × 500."
              fileId={bannerFileId}
              eventId={eventId}
              onChange={setBannerFileId}
              wide
            />
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function ImageSettingField({
  label,
  hint,
  fileId,
  eventId,
  onChange,
  wide,
}: {
  label: string;
  hint: string;
  fileId: string | null;
  eventId: string;
  onChange: (fileId: string | null) => void;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/50",
            wide ? "w-28" : "w-16",
          )}
        >
          {fileId ? (
            <img src={filesApi.downloadUrl(fileId)} alt={label} className="size-full object-cover" />
          ) : (
            <Upload className="size-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
            <Upload />
            {fileId ? "Replace" : "Upload"}
          </Button>
          {fileId && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-muted-foreground transition-colors hover:text-destructive"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {open && (
        <FileUploader
          eventId={eventId}
          fileType="headshot"
          accept="image/*"
          label="Drop an image, or click to browse"
          onUploaded={(fileId) => {
            onChange(fileId);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
