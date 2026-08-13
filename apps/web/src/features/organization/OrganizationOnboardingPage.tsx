import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { organizationSchema } from "@opensession/schemas";
import type { OrganizationInput } from "@opensession/schemas";
import type { z } from "zod";
import { ArrowRight, Building2, Check, ImagePlus, Megaphone } from "lucide-react";
import { Button, IconChip, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@opensession/ui";
import { toast } from "sonner";
import { organizationApi, ApiError } from "../../api";
import { ORGANIZATION_CONTEXT_KEY, useOrganizationContext } from "../../lib/organization";
import { TIMEZONES } from "../../lib/timezones";

type Values = z.infer<typeof organizationSchema>;

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export function OrganizationOnboardingPage() {
  const { data: context, isLoading } = useOrganizationContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [logo, setLogo] = useState<File | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const form = useForm<Values>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: "",
      slug: "",
      website_url: "",
      description: "",
      // A concrete, sensible default beats trusting the visitor's OS/browser
      // locale — that read the sandbox's locale, not where events actually
      // get run. Still just a starting point; the picker below is real.
      default_timezone: "America/Los_Angeles",
    },
  });
  const name = useWatch({ control: form.control, name: "name" });

  useEffect(() => {
    if (!slugTouched) form.setValue("slug", slugify(name ?? ""), { shouldValidate: false });
  }, [form, name, slugTouched]);

  useEffect(() => {
    if (!isLoading && context && !context.needs_onboarding) navigate("/app/events", { replace: true });
  }, [context, isLoading, navigate]);

  async function submit(values: Values) {
    try {
      await organizationApi.create({
        ...(values as OrganizationInput),
        website_url: values.website_url || null,
        description: values.description || null,
      });
      if (logo) await organizationApi.uploadLogo(logo);
      await queryClient.invalidateQueries({ queryKey: ORGANIZATION_CONTEXT_KEY });
      toast.success("Your workspace is ready");
      navigate("/app/events", { replace: true });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message2 : error instanceof Error ? error.message : "Could not create workspace");
    }
  }

  if (isLoading) return null;

  return (
    <div className="grid h-screen overflow-hidden bg-background lg:grid-cols-[.82fr_1.18fr]">
      {/* Same recipe as the login page's brand panel (bg-sidebar + a
       *  color-mix primary/track glow), not a separate hardcoded palette —
       *  the two first-run screens a visitor sees should look like one
       *  product in both light and dark, not switch identities. */}
      <aside className="relative hidden overflow-hidden bg-sidebar p-10 lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "radial-gradient(60rem 40rem at 15% 12%, color-mix(in oklch, var(--primary) 26%, transparent), transparent 62%), radial-gradient(46rem 34rem at 92% 88%, color-mix(in oklch, var(--track-5) 22%, transparent), transparent 60%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--foreground) 1px, transparent 1px), linear-gradient(to bottom, var(--foreground) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div className="relative flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Megaphone className="size-4.5" /></span>
          <span className="text-[15px] font-semibold tracking-tight text-foreground">Open Session</span>
        </div>

        <div className="relative mt-auto max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">First-run setup</p>
          <h1 className="mt-3 text-[32px] font-semibold leading-[1.15] tracking-tight text-foreground">Give every event a place to belong.</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">Your organization holds the team, brand, and events for this deployment. You can change these details whenever you need.</p>
          <ul className="mt-8 space-y-3">
            {["Private organizer workspace", "Passwordless team access", "Shared identity across every event"].map(item => (
              <li key={item} className="flex items-center gap-3">
                <IconChip tone="brand" size="sm"><Check /></IconChip>
                <span className="text-sm text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex items-center justify-center overflow-y-auto px-6 py-8 sm:px-10">
        <form onSubmit={form.handleSubmit(submit)} className="w-full max-w-2xl">
          <div className="mb-6"><span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-5" /></span><h2 className="mt-4 text-3xl font-semibold tracking-tight">Create your organization</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">This is the home for your team and every event you run.</p></div>

          <div className="grid gap-5 sm:grid-cols-[9rem_1fr]">
            <div>
              <Label>Organization logo</Label>
              <button type="button" onClick={() => fileRef.current?.click()} className="mt-2 flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-muted/35 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
                {logo ? <img src={URL.createObjectURL(logo)} alt="Organization logo preview" className="size-full object-cover" /> : <span className="flex flex-col items-center gap-2 text-xs"><ImagePlus className="size-5" />Add logo</span>}
              </button>
              <input ref={fileRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setLogo(event.target.files?.[0] ?? null)} />
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">PNG, JPEG, or WebP. Max 2 MB.</p>
            </div>

            <div className="space-y-4">
              <Field label="Organization name" error={form.formState.errors.name?.message}><Input autoFocus placeholder="Acme Events" {...form.register("name")} /></Field>
              <Field label="Workspace URL" hint={`Open Session / ${form.watch("slug") || "your-workspace"}`} error={form.formState.errors.slug?.message}><Input {...form.register("slug", { onChange: () => setSlugTouched(true) })} /></Field>
              <Field label="Website" error={form.formState.errors.website_url?.message}><Input type="url" placeholder="https://example.com" {...form.register("website_url")} /></Field>
              <Field label="Default timezone" error={form.formState.errors.default_timezone?.message}>
                <Controller
                  control={form.control}
                  name="default_timezone"
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
              <Field label="About your organization" error={form.formState.errors.description?.message}><Textarea rows={3} placeholder="A short description for your team workspace." {...form.register("description")} /></Field>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end border-t border-border pt-5"><Button size="lg" type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Creating…" : <>Create workspace <ArrowRight /></>}</Button></div>
        </form>
      </main>
    </div>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><div className="flex items-baseline justify-between gap-3"><Label>{label}</Label>{hint && <span className="truncate text-[11px] text-muted-foreground">{hint}</span>}</div>{children}{error && <p className="text-xs text-destructive">{error}</p>}</div>;
}
