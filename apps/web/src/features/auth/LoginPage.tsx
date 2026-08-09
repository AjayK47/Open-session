import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearchParams } from "react-router";
import { requestCodeSchema, verifyCodeSchema } from "@opensession/schemas";
import type { z } from "zod";
import type { EvaluationPersona, EvaluationPersonaName } from "@opensession/schemas";
import { Button, IconChip, Input, Label } from "@opensession/ui";
import { CalendarDays, FileText, Megaphone, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { authApi, ApiError } from "../../api";
import { useAuth } from "../../lib/auth";

type EmailForm = z.infer<typeof requestCodeSchema>;
type CodeForm = z.infer<typeof verifyCodeSchema>;

export function LoginPage() {
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [evaluationPersonas, setEvaluationPersonas] = useState<EvaluationPersona[]>([]);
  const [evaluationLogin, setEvaluationLogin] = useState<EvaluationPersonaName | null>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refetch } = useAuth();

  const emailForm = useForm<EmailForm>({ resolver: zodResolver(requestCodeSchema) });
  const codeForm = useForm<CodeForm>({ resolver: zodResolver(verifyCodeSchema) });
  const publicDemoSlug = evaluationPersonas
    .find((item) => item.persona === "speaker")
    ?.start_path.match(/^\/portal\/([^/]+)/)?.[1];

  useEffect(() => {
    let active = true;
    authApi.evaluationPersonas()
      .then((personas) => {
        if (active) setEvaluationPersonas(personas);
      })
      .catch(() => {
        // Evaluation access is intentionally absent on normal deployments.
      });
    return () => {
      active = false;
    };
  }, []);

  async function onRequestCode(values: EmailForm) {
    try {
      const res = await authApi.requestCode(values.email);
      setEmail(values.email);
      setDevCode(res.dev_code ?? null);
      codeForm.setValue("email", values.email);
      setStage("code");
      toast.success(res.dev_code ? "Dev mode: code shown below" : "Check your email for a sign-in code");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message2 : "Something went wrong");
    }
  }

  async function onVerify(values: CodeForm) {
    try {
      await authApi.verify(values.email, values.code);
      await refetch();
      navigate(params.get("next") || "/app/events");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message2 : "Invalid code");
    }
  }

  async function signInForEvaluation(item: EvaluationPersona) {
    setEvaluationLogin(item.persona);
    try {
      await authApi.evaluationLogin(item.persona);
      await refetch();
      navigate(params.get("next") || item.start_path);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message2 : "Evaluation sign-in failed");
      setEvaluationLogin(null);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel. Hidden below lg so the form owns small screens entirely. */}
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 lg:flex lg:flex-col">
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
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Megaphone className="size-4.5" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-foreground">Open Session</span>
        </div>

        <div className="relative mt-auto max-w-md">
          <h1 className="text-[32px] font-semibold leading-[1.15] tracking-tight text-foreground">
            Run your call for papers, end to end.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Collect submissions, review them as a team, confirm speakers, and build the agenda — all in one place.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              { icon: FileText, label: "Custom submission forms with conditional logic" },
              { icon: Users, label: "Blind review, scoring, and reviewer assignment" },
              { icon: CalendarDays, label: "Conflict-aware agenda scheduling" },
            ].map((item) => (
              <li key={item.label} className="flex items-center gap-3">
                <IconChip tone="brand" size="sm">
                  <item.icon />
                </IconChip>
                <span className="text-sm text-muted-foreground">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[22rem]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Megaphone className="size-4.5" />
            </span>
            <span className="text-[15px] font-semibold text-foreground">Open Session</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {stage === "email" ? "Sign in" : "Check your email"}
          </h2>
          <p className="mt-1.5 mb-7 text-sm text-muted-foreground">
            {stage === "email"
              ? "We'll email you a one-time code — no password needed."
              : "Enter the 6-digit code to continue."}
          </p>

          {evaluationPersonas.length > 0 && stage === "email" && (
            <section className="mb-7 overflow-hidden rounded-xl border border-primary/20 bg-primary/[0.045]">
              <div className="flex items-start gap-3 border-b border-primary/15 px-4 py-3.5">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                  <ShieldCheck className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">Evaluation workspace</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    Enter the seeded demo as any testing persona.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-px bg-border/60">
                {evaluationPersonas.map((item) => (
                  <button
                    key={item.persona}
                    type="button"
                    onClick={() => void signInForEvaluation(item)}
                    disabled={evaluationLogin !== null}
                    className="bg-background px-2 py-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-wait disabled:opacity-60"
                    title={`Sign in as ${item.email}`}
                  >
                    {evaluationLogin === item.persona ? "Opening…" : item.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Deliberately outside the evaluation block: an attendee who lands on
              the sign-in page needs a way to the programme whether or not this
              deployment has evaluation personas enabled. */}
          {stage === "email" && (
            <Link
              to={publicDemoSlug ? `/e/${publicDemoSlug}/sessions` : "/sessions"}
              className="mb-7 block rounded-lg border border-border bg-card px-4 py-3 text-center text-xs font-medium text-primary transition-colors hover:bg-accent"
            >
              Explore the public schedule — no sign-in required
            </Link>
          )}

          {stage === "email" ? (
          <form onSubmit={emailForm.handleSubmit(onRequestCode)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" type="email" placeholder="you@example.com" {...emailForm.register("email")} />
              {emailForm.formState.errors.email && (
                <p className="text-xs text-destructive">{emailForm.formState.errors.email.message}</p>
              )}
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={emailForm.formState.isSubmitting}>
              {emailForm.formState.isSubmitting ? "Sending…" : "Send sign-in code"}
            </Button>
          </form>
          ) : (
          <form onSubmit={codeForm.handleSubmit(onVerify)} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the code sent to <span className="font-medium text-foreground">{email}</span>.
            </p>
            {devCode && (
              <p className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-foreground">
                Development mode — your code is{" "}
                <span className="font-mono font-semibold tracking-wider text-warning">{devCode}</span>
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="code">Sign-in code</Label>
              <Input
                id="code"
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="h-11 text-center text-lg font-medium tracking-[0.4em]"
                {...codeForm.register("code")}
              />
              {codeForm.formState.errors.code && (
                <p className="text-xs text-destructive">{codeForm.formState.errors.code.message}</p>
              )}
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={codeForm.formState.isSubmitting}>
              {codeForm.formState.isSubmitting ? "Verifying…" : "Verify & continue"}
            </Button>
            <button
              type="button"
              onClick={() => setStage("email")}
              className="w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Use a different email
            </button>
          </form>
          )}
        </div>
      </main>
    </div>
  );
}
