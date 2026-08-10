import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { eventBasicsSchema } from "@opensession/schemas";
import type { ProgramSeedFormat, ProgramSeedRoom, ProgramSeedTrack } from "@opensession/schemas";
import type { z } from "zod";
import { format } from "date-fns";
import type { LucideIcon } from "lucide-react";
import { Sparkles, Settings2, Rocket, Plus, X, Layers, DoorOpen, Presentation, ImagePlus, UploadCloud } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@opensession/ui";
import { toast } from "sonner";
import { WizardShell, type WizardStep } from "../../components/wizard-shell";
import { Field, FieldError, ClearableDateTime } from "../../components/form-field";
import { eventsApi, uploadFile, ApiError } from "../../api";

type BasicsForm = z.infer<typeof eventBasicsSchema>;

const STEPS: WizardStep[] = [
  { key: "basics", label: "Basics", description: "Name, dates, timezone", icon: Sparkles },
  { key: "program", label: "Program defaults", description: "Tracks, rooms, formats", icon: Settings2 },
  { key: "review", label: "Review & create", description: "Confirm and go", icon: Rocket },
];

const EVENT_TYPES = [
  { value: "conference", label: "Conference" },
  { value: "summit", label: "Summit" },
  { value: "meetup", label: "Meetup" },
  { value: "other", label: "Other" },
];

const TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
];

export function CreateEventPage() {
  const [step, setStep] = useState("basics");
  const [completed, setCompleted] = useState(new Set<string>());
  const [tracks, setTracks] = useState<ProgramSeedTrack[]>([{ name: "Main Track" }]);
  const [rooms, setRooms] = useState<ProgramSeedRoom[]>([{ name: "Main Room" }]);
  const [formats, setFormats] = useState<ProgramSeedFormat[]>([{ name: "Talk", default_duration_minutes: 30 }]);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const form = useForm<BasicsForm>({
    resolver: zodResolver(eventBasicsSchema),
    defaultValues: {
      name: "",
      slug: "",
      type: "conference",
      website_url: "",
      location: "",
      timezone: TIMEZONES.includes(Intl.DateTimeFormat().resolvedOptions().timeZone)
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "UTC",
      starts_at: "",
      ends_at: "",
      description: "",
    },
  });

  const description = useWatch({ control: form.control, name: "description" }) ?? "";
  const watched = useWatch({ control: form.control });

  useEffect(() => {
    if (!coverImage) {
      setCoverPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(coverImage);
    setCoverPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [coverImage]);

  function goNext(from: string, to: string) {
    setCompleted((prev) => new Set(prev).add(from));
    setStep(to);
  }

  async function handleCreate() {
    const valid = await form.trigger();
    if (!valid) {
      setStep("basics");
      toast.error("Fix the highlighted fields first");
      return;
    }
    const values = form.getValues();
    setIsCreating(true);
    try {
      const event = await eventsApi.create({
        name: values.name,
        slug: values.slug,
        type: values.type,
        website_url: values.website_url || null,
        location: values.location || null,
        timezone: values.timezone,
        starts_at: values.starts_at,
        ends_at: values.ends_at,
        description: values.description || null,
        program: {
          tracks: tracks.filter((t) => t.name.trim()),
          rooms: rooms.filter((r) => r.name.trim()),
          formats: formats.filter((f) => f.name.trim()),
        },
      });
      if (coverImage) {
        try {
          const bannerFileId = await uploadFile(event.id, coverImage, "headshot");
          await eventsApi.update(event.id, { banner_file_id: bannerFileId });
        } catch (error) {
          toast.warning(
            error instanceof ApiError
              ? `Event created, but the cover image could not be saved: ${error.message2}`
              : "Event created, but the cover image could not be saved.",
          );
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success(`${event.name} created`);
      navigate(`/app/events/${event.id}/dashboard`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message2 : "Could not create event");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <WizardShell
      title="Create event"
      subtitle="Set up a new conference, summit, or meetup."
      backHref="/app/events"
      steps={STEPS}
      activeStep={step}
      completedSteps={completed}
      onStepChange={setStep}
      footer={
        <>
          <Button
            variant="outline"
            disabled={step === "basics"}
            onClick={() => setStep(step === "review" ? "program" : "basics")}
          >
            Back
          </Button>
          {step === "review" ? (
            <Button onClick={handleCreate} disabled={isCreating}>
              <Rocket className="h-4 w-4" />
              {isCreating ? "Creating…" : "Create event"}
            </Button>
          ) : (
            <Button onClick={() => goNext(step, step === "basics" ? "program" : "review")}>Next</Button>
          )}
        </>
      }
    >
      {step === "basics" && (
        <div className="space-y-5">
          <StepIntro
            title="Event basics"
            description="The essentials. Everything here can be changed later in Event Settings."
          />
          <Card>
            <CardContent className="grid gap-x-5 gap-y-4 pt-5 sm:grid-cols-2">
            <Field label="Event Name" required>
              <Input placeholder="AI Engineer Conference 2026" {...form.register("name")} />
              {form.formState.errors.name && <FieldError message={form.formState.errors.name.message} />}
            </Field>
            <Field label="Event Slug" required hint="Used in public URLs for this event.">
              <Input placeholder="ai-engineer-2026" {...form.register("slug")} />
              {form.formState.errors.slug && <FieldError message={form.formState.errors.slug.message} />}
            </Field>

            <Field label="Event Type" hint="How this event is categorized.">
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
            <Field label="Event Website URL" hint="Where attendees can learn more.">
              <Input placeholder="https://example.com" {...form.register("website_url")} />
            </Field>

            <Field label="Event Location" hint="City, venue, or 'Virtual'.">
              <Input placeholder="San Francisco, CA" {...form.register("location")} />
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

            <Field label="Starts At" required hint="When the event begins.">
              <Controller
                control={form.control}
                name="starts_at"
                render={({ field }) => <ClearableDateTime value={field.value ?? ""} onChange={field.onChange} />}
              />
              {form.formState.errors.starts_at && <FieldError message="Required" />}
            </Field>
            <Field label="Ends At" required hint="When the event ends.">
              <Controller
                control={form.control}
                name="ends_at"
                render={({ field }) => <ClearableDateTime value={field.value ?? ""} onChange={field.onChange} />}
              />
              {form.formState.errors.ends_at && <FieldError message="Required" />}
            </Field>
              <div className="space-y-2 sm:col-span-2">
                <div>
                  <Label>Cover image</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Used on event cards and public event pages. Recommended 1500 × 500.
                  </p>
                </div>
                <CoverImagePicker
                  file={coverImage}
                  previewUrl={coverPreviewUrl}
                  onChange={setCoverImage}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Theme</Label>
                <p className="text-xs text-muted-foreground">
                  This helps improve search, recommendations, and how content is organized.
                </p>
                <Textarea rows={3} maxLength={1000} placeholder="What's this event about?" {...form.register("description")} />
                <p className="text-right text-xs tabular text-muted-foreground">{description.length} / 1000</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === "program" && (
        <div className="space-y-5">
          <StepIntro
            title="Program defaults"
            description="Seed a few starting records so the agenda has something to work with. You can add, edit, or remove all of these later in Program Setup."
          />
          <SeedListEditor
            label="Tracks"
            hint="Parallel themes running through your program."
            icon={Layers}
            items={tracks}
            onChange={setTracks}
            placeholder="e.g. Infrastructure"
          />
          <SeedListEditor
            label="Rooms"
            hint="Physical or virtual spaces sessions are scheduled into."
            icon={DoorOpen}
            items={rooms}
            onChange={setRooms}
            placeholder="e.g. Main Stage"
          />
          <SeedListEditor
            label="Session formats"
            hint="Talk shapes, each with a default duration."
            icon={Presentation}
            items={formats}
            onChange={setFormats}
            placeholder="e.g. Lightning Talk"
          />
        </div>
      )}

      {step === "review" && (
        <div className="space-y-5">
          <StepIntro title="Review & create" description="Confirm the details below, then create the event." />

          <Card className="overflow-hidden">
            <div className="h-28" style={coverPreviewUrl ? undefined : coverStyle(watched.slug || "new-event")}>
              {coverPreviewUrl && <img src={coverPreviewUrl} alt="Event cover preview" className="size-full object-cover" />}
            </div>
            <CardContent className="pt-4">
              <h3 className="text-base font-semibold text-foreground">{watched.name || "Untitled event"}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                /{watched.slug || "…"} · {EVENT_TYPES.find((t) => t.value === watched.type)?.label ?? "—"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Event details</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border border-t border-border pt-0">
              <ReviewRow label="Location" value={watched.location || "Not set"} />
              <ReviewRow label="Starts" value={formatReviewDate(watched.starts_at)} />
              <ReviewRow label="Ends" value={formatReviewDate(watched.ends_at)} />
              <ReviewRow label="Timezone" value={watched.timezone || "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Program defaults</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 border-t border-border pt-4">
              <ReviewChips label="Tracks" values={tracks.map((t) => t.name).filter(Boolean)} />
              <ReviewChips label="Rooms" values={rooms.map((r) => r.name).filter(Boolean)} />
              <ReviewChips label="Formats" values={formats.map((f) => f.name).filter(Boolean)} />
            </CardContent>
          </Card>
        </div>
      )}
    </WizardShell>
  );
}

function CoverImagePicker({
  file,
  previewUrl,
  onChange,
}: {
  file: File | null;
  previewUrl: string | null;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function chooseFile(nextFile?: File) {
    if (!nextFile) return;
    if (!nextFile.type.startsWith("image/")) {
      toast.error("Choose a JPG, PNG, WebP, or GIF image.");
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      toast.error("Cover images must be 10 MB or smaller.");
      return;
    }
    onChange(nextFile);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          chooseFile(event.dataTransfer.files[0]);
        }}
        className="group relative flex min-h-36 w-full items-center justify-center overflow-hidden text-muted-foreground outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        {previewUrl ? (
          <>
            <img src={previewUrl} alt="Selected event cover" className="absolute inset-0 size-full object-cover" />
            <span className="relative flex items-center gap-2 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <UploadCloud className="size-3.5" /> Replace image
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-2 px-6 py-5 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ImagePlus className="size-5" />
            </span>
            <span className="text-sm font-medium text-foreground">Upload a cover image</span>
            <span className="text-xs">Drop an image here or click to browse</span>
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(event) => chooseFile(event.target.files?.[0])}
      />
      {file && (
        <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
          <p className="min-w-0 truncate text-xs text-muted-foreground">{file.name}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            Remove
          </Button>
        </div>
      )}
    </div>
  );
}

/** Deterministic cover gradient, matching the one used on the events list so a
 *  new event previews with the identity it will actually get. */
function coverStyle(seed: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return {
    backgroundImage: `linear-gradient(115deg, oklch(0.72 0.15 ${hue}), oklch(0.62 0.17 ${(hue + 48) % 360}))`,
  };
}

function formatReviewDate(value?: string): string {
  if (!value) return "Not set";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, "MMM d, yyyy 'at' h:mm a");
}

function StepIntro({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function ReviewChips({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="w-20 shrink-0 pt-0.5 text-muted-foreground">{label}</span>
      {values.length ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <Badge key={v} variant="secondary" className="font-normal">
              {v}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="pt-0.5 text-muted-foreground">None</span>
      )}
    </div>
  );
}

function SeedListEditor<T extends { name: string }>({
  label,
  hint,
  icon: Icon,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  hint: string;
  icon: LucideIcon;
  items: T[];
  onChange: (items: T[]) => void;
  placeholder: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        </div>

        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={item.name}
                placeholder={placeholder}
                onChange={(e) => onChange(items.map((it, j) => (j === i ? { ...it, name: e.target.value } : it)))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${item.name || label}`}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, { name: "" } as T])}>
          <Plus />
          Add {label.toLowerCase().replace(/s$/, "")}
        </Button>
      </CardContent>
    </Card>
  );
}
