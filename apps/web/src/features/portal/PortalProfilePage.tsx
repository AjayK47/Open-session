import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlignLeft, CheckCircle2, Link2, User } from "lucide-react";
import { profileSchema } from "@opensession/schemas";
import type { ProfileUpdateInput } from "@opensession/schemas";
import { Avatar, AvatarFallback, AvatarImage, Button, Input, Label, Textarea, cn } from "@opensession/ui";
import { toast } from "sonner";
import { meApi, filesApi, ApiError } from "../../api";
import { FileUploader } from "../../components/file-uploader";
import { usePortalEvent } from "./usePortalEvent";
import { PortalPageHeader } from "./PortalPageHeader";

/** The same fields the portal home scores completeness against — kept in one
 *  place so the meter here and the card there can never disagree. */
const COMPLETION_FIELDS = ["first_name", "last_name", "bio", "company", "job_title"] as const;

export function PortalProfilePage() {
  const { event } = usePortalEvent();
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ["me", "profile"], queryFn: meApi.profile });
  const form = useForm<ProfileUpdateInput>({ resolver: zodResolver(profileSchema) });

  useEffect(() => {
    if (profile) {
      form.reset({
        first_name: profile.first_name ?? "",
        last_name: profile.last_name ?? "",
        bio: profile.bio ?? "",
        company: profile.company ?? "",
        job_title: profile.job_title ?? "",
        phone: profile.phone ?? "",
        website: profile.website ?? "",
        linkedin_url: profile.linkedin_url ?? "",
        x_url: profile.x_url ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.person_id]);

  const save = useMutation({
    mutationFn: (values: ProfileUpdateInput) => meApi.updateProfile(values),
    onSuccess: (updated) => {
      toast.success("Profile updated");
      void queryClient.invalidateQueries({ queryKey: ["me", "profile"] });
      // Reset to the saved values so the dirty indicator clears without a refetch.
      form.reset(form.getValues(), { keepValues: true });
      return updated;
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save profile"),
  });

  if (!profile) return null;

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email;
  const filled = COMPLETION_FIELDS.filter((f) => profile[f]).length;
  const percent = Math.round((filled / COMPLETION_FIELDS.length) * 100);
  const dirty = form.formState.isDirty;

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-6">
      <PortalPageHeader
        title="Profile"
        description="Your bio and photo appear on the public program and in the event app."
        actions={
          <>
            {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
            <Button type="submit" disabled={save.isPending || !dirty}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      />

      {/* Identity rail and fields share one grid so both columns start on the
          same baseline — previously the identity card spanned the full page
          width while the form sat in a narrow measure beneath it. */}
      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-32 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col items-center text-center">
              <Avatar className="size-20">
                {profile.headshot_file_id && (
                  <AvatarImage src={filesApi.downloadUrl(profile.headshot_file_id)} alt="" />
                )}
                <AvatarFallback className="text-lg font-medium">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <p className="mt-3 truncate text-sm font-medium text-foreground">{name}</p>
              <p className="w-full truncate text-xs text-muted-foreground">{profile.email}</p>
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">Profile completeness</span>
                <span className="tabular-nums text-muted-foreground">{percent}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500",
                    percent === 100 ? "bg-success" : "bg-primary",
                  )}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {percent === 100 ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <CheckCircle2 className="size-3.5" />
                    Everything organizers need
                  </span>
                ) : (
                  `${COMPLETION_FIELDS.length - filled} field${COMPLETION_FIELDS.length - filled === 1 ? "" : "s"} left`
                )}
              </p>
            </div>

            {event && (
              <div className="mt-5 border-t border-border pt-4">
                <Label className="mb-2 block text-xs">Headshot</Label>
                <FileUploader
                  eventId={event.id}
                  fileType="headshot"
                  as="me"
                  accept="image/*"
                  onUploaded={() => void queryClient.invalidateQueries({ queryKey: ["me", "profile"] })}
                />
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Square, at least 400×400. Used on the program and in printed signage.
                </p>
              </div>
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          <Section icon={User} title="Your details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" htmlFor="first_name">
                <Input id="first_name" {...form.register("first_name")} />
              </Field>
              <Field label="Last name" htmlFor="last_name">
                <Input id="last_name" {...form.register("last_name")} />
              </Field>
              <Field label="Company" htmlFor="company">
                <Input id="company" {...form.register("company")} />
              </Field>
              <Field label="Job title" htmlFor="job_title">
                <Input id="job_title" {...form.register("job_title")} />
              </Field>
              <Field
                label="Phone"
                htmlFor="phone"
                hint="Only visible to organizers, for on-site contact."
                className="sm:col-span-2"
              >
                <Input id="phone" type="tel" {...form.register("phone")} />
              </Field>
            </div>
          </Section>

          <Section icon={AlignLeft} title="Biography">
            <Field label="Biography" htmlFor="bio" hint="A short third-person bio — 50–100 words works well." srOnlyLabel>
              <Textarea id="bio" rows={6} {...form.register("bio")} />
            </Field>
          </Section>

          <Section icon={Link2} title="Links">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Website" htmlFor="website">
                <Input id="website" type="url" placeholder="https://" {...form.register("website")} />
              </Field>
              <Field label="LinkedIn" htmlFor="linkedin_url">
                <Input id="linkedin_url" type="url" placeholder="https://linkedin.com/in/…" {...form.register("linkedin_url")} />
              </Field>
              <Field label="X / Twitter" htmlFor="x_url">
                <Input id="x_url" type="url" placeholder="https://x.com/…" {...form.register("x_url")} />
              </Field>
            </div>
          </Section>

          {/* Repeated at the bottom so a speaker who has scrolled through the
              whole form never has to scroll back up to save. */}
          <div className="flex items-center justify-end gap-3">
            {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
            <Button type="submit" disabled={save.isPending || !dirty}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  className,
  srOnlyLabel,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  className?: string;
  srOnlyLabel?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className={srOnlyLabel ? "sr-only" : undefined}>
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
