import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Trash2, Plus, Copy } from "lucide-react";
import { Button, Checkbox, Input, Label } from "@opensession/ui";
import { toast } from "sonner";
import { apiKeySchema } from "@opensession/schemas";
import { apiKeysApi, API_KEY_SCOPES, ApiError } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { PageHeader } from "../../layouts/organizer-shell";
import { DrawerForm } from "../../components/drawer-form";
import { EmptyState } from "../../components/empty-state";

export function ApiKeysPage() {
  const { eventId } = useCurrentEvent();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({ queryKey: ["api-keys", eventId], queryFn: () => apiKeysApi.list(eventId) });

  const form = useForm({ resolver: zodResolver(apiKeySchema), defaultValues: { name: "", scopes: [] as string[], expires_at: null } });

  const create = useMutation({
    mutationFn: (values: { name: string; scopes: string[]; expires_at?: string | null }) => apiKeysApi.create(eventId, values),
    onSuccess: (key) => {
      setCreatedKey(key.key);
      form.reset({ name: "", scopes: [], expires_at: null });
      void queryClient.invalidateQueries({ queryKey: ["api-keys", eventId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not create key"),
  });

  const remove = useMutation({
    mutationFn: (keyId: string) => apiKeysApi.remove(keyId),
    onSuccess: () => {
      toast.success("API key revoked");
      void queryClient.invalidateQueries({ queryKey: ["api-keys", eventId] });
    },
  });

  function closeDrawer() {
    setOpen(false);
    setCreatedKey(null);
  }

  const scopes = form.watch("scopes");

  return (
    <div>
      <PageHeader
        icon={KeyRound}
        title="API"
        subtitle="Create scoped API keys for programmatic access."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Create key
          </Button>
        }
      />
      <div className="px-6 py-6">
        {!isLoading && data.length === 0 ? (
          <EmptyState icon={KeyRound} title="No API keys yet" />
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {data.map((key) => (
              <div key={key.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{key.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{key.scopes.join(", ")}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove.mutate(key.id)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <DrawerForm
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : closeDrawer())}
        title={createdKey ? "Key created" : "Create API key"}
        onSubmit={createdKey ? undefined : form.handleSubmit((v) => create.mutate(v))}
        isSubmitting={create.isPending}
        submitLabel="Create"
        footer={
          createdKey ? (
            <Button onClick={closeDrawer}>Done</Button>
          ) : undefined
        }
      >
        {createdKey ? (
          <div className="space-y-3">
            <p className="rounded-md bg-warning/15 px-3 py-2 text-sm text-warning">
              Copy this key now — you won't be able to see it again.
            </p>
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
              <code className="flex-1 overflow-x-auto font-mono text-xs">{createdKey}</code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  void navigator.clipboard.writeText(createdKey);
                  toast.success("Copied");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input {...form.register("name")} placeholder="CI pipeline" />
            </div>
            <div className="space-y-2">
              <Label>Scopes</Label>
              {API_KEY_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={scopes.includes(scope)}
                    onCheckedChange={(v) =>
                      form.setValue("scopes", v ? [...scopes, scope] : scopes.filter((s) => s !== scope))
                    }
                  />
                  <span className="font-mono text-xs">{scope}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </DrawerForm>
    </div>
  );
}
