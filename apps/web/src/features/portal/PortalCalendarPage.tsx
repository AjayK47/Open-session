import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck2, RefreshCw, Trash2 } from "lucide-react";
import { useParams, useSearchParams } from "react-router";
import { Button } from "@opensession/ui";
import type { CalendarConnection, CalendarProvider } from "@opensession/schemas";
import { toast } from "sonner";
import { ApiError, calendarApi } from "../../api";
import { PortalPageHeader } from "./PortalPageHeader";

const PROVIDERS: { provider: CalendarProvider; label: string; detail: string; accent: string }[] = [
  { provider: "google", label: "Google Calendar", detail: "Sync to your primary Google calendar", accent: "bg-[#4285F4]" },
  { provider: "microsoft", label: "Outlook Calendar", detail: "Sync through your Microsoft account", accent: "bg-[#0078D4]" },
];

export function PortalCalendarPage() {
  const { eventSlug } = useParams<{ eventSlug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState<CalendarProvider | null>(null);
  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["calendar-connections"],
    queryFn: calendarApi.connections,
  });

  useEffect(() => {
    if (searchParams.get("calendar") === "connected") {
      toast.success("Calendar connected");
      setSearchParams({}, { replace: true });
      void queryClient.invalidateQueries({ queryKey: ["calendar-connections"] });
    }
  }, [queryClient, searchParams, setSearchParams]);

  async function connect(provider: CalendarProvider) {
    setStarting(provider);
    try {
      const result = await calendarApi.start(provider, `/portal/${eventSlug}/calendar`);
      window.location.assign(result.authorization_url);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message2 : "Could not start calendar connection");
      setStarting(null);
    }
  }

  const sync = useMutation({
    mutationFn: calendarApi.sync,
    onSuccess: () => {
      toast.success("Calendar synchronized");
      void queryClient.invalidateQueries({ queryKey: ["calendar-connections"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Calendar sync failed"),
  });

  const disconnect = useMutation({
    mutationFn: calendarApi.disconnect,
    onSuccess: () => {
      toast.success("Calendar disconnected");
      void queryClient.invalidateQueries({ queryKey: ["calendar-connections"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message2 : "Could not disconnect calendar"),
  });

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title="Keep your sessions in sync"
        description="Connect your own calendar once. Scheduled sessions are created automatically and stay current when the organizer changes the agenda."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {PROVIDERS.map((provider) => {
          const connection = connections.find((item) => item.provider === provider.provider);
          return (
            <ProviderCard
              key={provider.provider}
              provider={provider}
              connection={connection}
              loading={isLoading}
              starting={starting === provider.provider}
              syncing={sync.isPending}
              disconnecting={disconnect.isPending}
              onConnect={() => void connect(provider.provider)}
              onSync={() => connection && sync.mutate(connection.id)}
              onDisconnect={() => connection && disconnect.mutate(connection.id)}
            />
          );
        })}
      </div>

      <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
        Only sessions assigned to your speaker profile are synchronized. You can disconnect at any time. Downloadable and emailed iCalendar invites remain available even without a connected account.
      </p>
    </div>
  );
}

function ProviderCard({
  provider,
  connection,
  loading,
  starting,
  syncing,
  disconnecting,
  onConnect,
  onSync,
  onDisconnect,
}: {
  provider: (typeof PROVIDERS)[number];
  connection?: CalendarConnection;
  loading: boolean;
  starting: boolean;
  syncing: boolean;
  disconnecting: boolean;
  onConnect: () => void;
  onSync: () => void;
  onDisconnect: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 p-5">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${provider.accent}`}>
          <CalendarCheck2 className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{provider.label}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{provider.detail}</p>
        </div>
        {connection && <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${connection.status === "active" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>{connection.status}</span>}
      </div>
      <div className="border-t border-border bg-secondary/25 px-5 py-4">
        {loading ? <p className="text-xs text-muted-foreground">Checking connection…</p> : connection ? (
          <div className="space-y-3">
            <div><p className="truncate text-sm font-medium">{connection.provider_account_email || "Connected account"}</p><p className="mt-0.5 text-xs text-muted-foreground">{connection.synced_events} synchronized · {connection.failed_events} failed{connection.last_synced_at ? ` · Last sync ${new Date(connection.last_synced_at).toLocaleString()}` : ""}</p></div>
            {connection.last_error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{connection.last_error}</p>}
            <div className="flex gap-2"><Button size="sm" variant="outline" onClick={onSync} disabled={syncing}><RefreshCw className="size-3.5" />Sync now</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={onDisconnect} disabled={disconnecting}><Trash2 className="size-3.5" />Disconnect</Button></div>
          </div>
        ) : <Button size="sm" onClick={onConnect} disabled={starting}>{starting ? "Opening provider…" : `Connect ${provider.label}`}</Button>}
      </div>
    </section>
  );
}
