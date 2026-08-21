import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { organizationInviteSchema, organizationSchema } from "@opensession/schemas";
import type { OrganizationInput } from "@opensession/schemas";
import type { z } from "zod";
import { ArrowLeft, Building2, Clock3, Copy, ImagePlus, MailPlus, RefreshCw, Trash2, UsersRound } from "lucide-react";
import { Badge, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@opensession/ui";
import { toast } from "sonner";
import { ApiError, apiUrl, organizationApi } from "../../api";
import { ORGANIZATION_CONTEXT_KEY, useOrganizationContext } from "../../lib/organization";
import { OrganizationSwitcher } from "../../components/organization-switcher";

type DetailsValues = z.infer<typeof organizationSchema>;
type InviteValues = z.infer<typeof organizationInviteSchema>;

export function OrganizationSettingsPage() {
  const queryClient = useQueryClient();
  const { data: context } = useOrganizationContext();
  const [tab, setTab] = useState<"details" | "team">("details");
  const { data: organization } = useQuery({ queryKey: ["organization"], queryFn: organizationApi.get });
  const { data: members = [] } = useQuery({ queryKey: ["organization", "members"], queryFn: organizationApi.members, enabled: tab === "team" });
  const { data: invitations = [] } = useQuery({ queryKey: ["organization", "invitations"], queryFn: organizationApi.invitations, enabled: tab === "team" });
  const [showInvite, setShowInvite] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const details = useForm<DetailsValues>({ resolver: zodResolver(organizationSchema) });
  const inviteForm = useForm<InviteValues>({ resolver: zodResolver(organizationInviteSchema), defaultValues: { email: "", role: "admin" } });

  useEffect(() => {
    if (organization) details.reset({ name: organization.name, slug: organization.slug, website_url: organization.website_url ?? "", description: organization.description ?? "", default_timezone: organization.default_timezone });
  }, [details, organization]);

  const save = useMutation({
    mutationFn: (values: DetailsValues) => organizationApi.update({ ...(values as OrganizationInput), website_url: values.website_url || null, description: values.description || null }),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["organization"] }), queryClient.invalidateQueries({ queryKey: ORGANIZATION_CONTEXT_KEY })]); toast.success("Organization updated"); },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not save organization"),
  });
  const invite = useMutation({
    mutationFn: (values: InviteValues) => organizationApi.invite(values.email, values.role),
    onSuccess: async (result) => { await queryClient.invalidateQueries({ queryKey: ["organization", "invitations"] }); inviteForm.reset({ email: "", role: "admin" }); setShowInvite(false); if (result.invite_url) await navigator.clipboard.writeText(result.invite_url); toast.success(result.invite_url ? "Invitation created and development link copied" : "Invitation sent"); },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not invite teammate"),
  });
  const resend = useMutation({ mutationFn: organizationApi.resend, onSuccess: async (result) => { await queryClient.invalidateQueries({ queryKey: ["organization", "invitations"] }); if (result.invite_url) await navigator.clipboard.writeText(result.invite_url); toast.success(result.invite_url ? "New development link copied" : "Invitation resent"); } });
  const revoke = useMutation({ mutationFn: organizationApi.revoke, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organization", "invitations"] }) });
  const remove = useMutation({ mutationFn: organizationApi.removeMember, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organization", "members"] }) });

  async function uploadLogo(file: File) {
    try { await organizationApi.uploadLogo(file); await Promise.all([queryClient.invalidateQueries({ queryKey: ["organization"] }), queryClient.invalidateQueries({ queryKey: ORGANIZATION_CONTEXT_KEY })]); toast.success("Logo updated"); } catch (error) { toast.error(error instanceof Error ? error.message : "Logo upload failed"); }
  }

  const canManage = context?.membership_role === "owner" || context?.membership_role === "admin";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/70 backdrop-blur"><div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6"><Button variant="ghost" size="icon-sm" asChild><Link to="/app/events"><ArrowLeft /></Link></Button><div className="flex min-w-0 items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 className="size-4" /></span><div><p className="truncate text-sm font-semibold">{organization?.name ?? "Organization"}</p><p className="text-[11px] text-muted-foreground">Workspace settings</p></div></div>{(context?.organizations?.length ?? 0) > 1 && <div className="ml-auto w-56"><OrganizationSwitcher currentOrganizationId={context?.organization?.id} currentOrganizationName={context?.organization?.name} organizations={context?.organizations ?? []} /></div>}</div></header>
      <main className="mx-auto max-w-6xl px-6 py-9">
        <div className="flex gap-1 border-b border-border">{([['details','Details',Building2],['team','Team & invitations',UsersRound]] as const).map(([key,label,Icon]) => <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${tab===key?'border-primary text-foreground':'border-transparent text-muted-foreground hover:text-foreground'}`}><Icon className="size-4" />{label}</button>)}</div>

        {tab === "details" && organization && <form onSubmit={details.handleSubmit(v => save.mutate(v))} className="grid gap-8 py-8 lg:grid-cols-[16rem_1fr]">
          <div><h1 className="text-lg font-semibold">Organization profile</h1><p className="mt-1 text-sm leading-6 text-muted-foreground">Shared identity and defaults for every event in this deployment.</p><button type="button" onClick={() => fileRef.current?.click()} className="mt-6 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-muted/30 text-muted-foreground hover:border-primary/50 hover:text-primary">{organization.logo_url ? <img src={apiUrl(organization.logo_url)} alt="" className="size-full object-contain p-5" /> : <span className="flex flex-col items-center gap-2 text-xs"><ImagePlus className="size-5" />Upload organization logo</span>}</button><input ref={fileRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const file=e.target.files?.[0]; if(file) void uploadLogo(file); }} /></div>
          <div className="space-y-5 rounded-2xl border border-border bg-card p-6"><Field label="Organization name" error={details.formState.errors.name?.message}><Input {...details.register("name")} disabled={!canManage} /></Field><Field label="Workspace slug" error={details.formState.errors.slug?.message}><Input {...details.register("slug")} disabled={!canManage} /></Field><Field label="Website" error={details.formState.errors.website_url?.message}><Input {...details.register("website_url")} disabled={!canManage} /></Field><Field label="Default timezone" error={details.formState.errors.default_timezone?.message}><Input {...details.register("default_timezone")} disabled={!canManage} /></Field><Field label="Description" error={details.formState.errors.description?.message}><Textarea rows={5} {...details.register("description")} disabled={!canManage} /></Field>{canManage && <div className="flex justify-end border-t border-border pt-5"><Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save changes"}</Button></div>}</div>
        </form>}

        {tab === "team" && <div className="space-y-8 py-8">
          <section><div className="flex items-end justify-between gap-4"><div><h1 className="text-lg font-semibold">Organization team</h1><p className="mt-1 text-sm text-muted-foreground">Owners and admins can manage every event. Members need event-specific access.</p></div>{canManage && <Button onClick={() => setShowInvite(v => !v)}><MailPlus />Invite teammate</Button>}</div>
            {showInvite && <form onSubmit={inviteForm.handleSubmit(v => invite.mutate(v))} className="mt-5 grid gap-4 rounded-2xl border border-primary/20 bg-primary/[.035] p-5 sm:grid-cols-[1fr_11rem_auto]"><Field label="Email" error={inviteForm.formState.errors.email?.message}><Input type="email" placeholder="teammate@example.com" {...inviteForm.register("email")} /></Field><div className="space-y-1.5"><Label>Role</Label><Select value={inviteForm.watch("role")} onValueChange={v => inviteForm.setValue("role", v as "admin"|"member")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="admin">Admin</SelectItem><SelectItem value="member">Member</SelectItem></SelectContent></Select></div><Button className="self-end" type="submit" disabled={invite.isPending}>{invite.isPending?"Sending…":"Send invite"}</Button></form>}
            <div className="mt-5 overflow-hidden rounded-xl border border-border bg-card">{members.map(member => <div key={member.user_id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"><span className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-semibold">{member.email.slice(0,2).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{member.email}</p><p className="text-xs capitalize text-muted-foreground">{member.role}</p></div><Badge variant="muted" className="ml-auto capitalize">{member.status}</Badge>{canManage && member.role !== "owner" && <Button variant="ghost" size="icon-sm" onClick={() => remove.mutate(member.user_id)}><Trash2 /></Button>}</div>)}</div>
          </section>
          {invitations.length > 0 && <section><h2 className="text-sm font-semibold">Invitation history</h2><div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">{invitations.map(item => <div key={item.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"><span className="flex size-9 items-center justify-center rounded-full bg-warning/10 text-warning"><Clock3 className="size-4" /></span><div className="min-w-0"><p className="truncate text-sm font-medium">{item.email}</p><p className="text-xs capitalize text-muted-foreground">{item.role} · expires {new Date(item.expires_at).toLocaleDateString()}</p></div><Badge variant="muted" className="ml-auto capitalize">{item.status}</Badge>{item.status === "pending" && <><Button variant="ghost" size="icon-sm" title="Resend" onClick={() => resend.mutate(item.id)}><RefreshCw /></Button>{item.invite_url && <Button variant="ghost" size="icon-sm" title="Copy link" onClick={() => { void navigator.clipboard.writeText(item.invite_url!); toast.success("Link copied"); }}><Copy /></Button>}<Button variant="ghost" size="icon-sm" title="Revoke" onClick={() => revoke.mutate(item.id)}><Trash2 /></Button></>}</div>)}</div></section>}
        </div>}
      </main>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}{error && <p className="text-xs text-destructive">{error}</p>}</div>; }
