import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { differenceInCalendarDays } from "date-fns";
import { CalendarDays, LogOut, MapPin, Megaphone, Plus, Sparkles, ArrowRight, Building2, Settings, UsersRound } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@opensession/ui";
import { eventsApi, filesApi } from "../../api";
import type { Event } from "@opensession/schemas";
import { formatEventDates } from "../../components/event-identity";
import { useOrganizationContext } from "../../lib/organization";
import { useAuth } from "../../lib/auth";
import { apiUrl } from "../../api";

/** Deterministic hue pair per event id, so an event without a banner still gets
 *  a stable identity instead of a grey placeholder. */
function coverStyle(id: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  const hue2 = (hue + 48) % 360;
  return {
    backgroundImage: `linear-gradient(115deg, oklch(0.72 0.15 ${hue}), oklch(0.62 0.17 ${hue2}))`,
  };
}

type Phase = { label: string; tone: "live" | "soon" | "past" | "planning" };

/** Human phase from the event window, used for the badge and the countdown. */
function phaseOf(event: Event): Phase {
  if (!event.starts_at) return { label: "No dates set", tone: "planning" };
  const today = new Date();
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : start;
  const daysToStart = differenceInCalendarDays(start, today);
  const daysToEnd = differenceInCalendarDays(end, today);

  if (daysToEnd < 0) return { label: "Ended", tone: "past" };
  if (daysToStart <= 0) return { label: "Happening now", tone: "live" };
  if (daysToStart === 1) return { label: "Tomorrow", tone: "soon" };
  return { label: `In ${daysToStart} days`, tone: "soon" };
}

/** Always the event's own timezone — this card sits beside the public widgets in
 *  a consistency check, and formatting in the viewer's zone shifts a conference
 *  that ends at 6pm Pacific onto the following day. */
function dateRange(event: Event): string {
  return formatEventDates(event) ?? "Dates not set";
}

export function EventListPage() {
  const { data: events, isLoading } = useQuery({ queryKey: ["events"], queryFn: eventsApi.list });
  const { data: organizationContext } = useOrganizationContext();
  const organization = organizationContext?.organization;
  const { user, logout } = useAuth();
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/65"><div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-6">
        <span className="flex size-9 items-center justify-center overflow-hidden rounded-xl border border-border bg-background text-primary">{organization?.logo_url ? <img src={apiUrl(organization.logo_url)} alt="" className="size-full object-contain p-1" /> : <Building2 className="size-4.5" />}</span>
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{organization?.name ?? "Your events"}</p><p className="text-[11px] text-muted-foreground">Organization workspace</p></div>
        <div className="ml-auto flex items-center gap-1.5">
          {organization && <Button variant="ghost" size="sm" asChild><Link to="/app/crm"><UsersRound />Speaker CRM</Link></Button>}
          {organization && <Button variant="ghost" size="sm" asChild><Link to="/app/organization"><Settings />Organization settings</Link></Button>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="ml-0.5 rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
              >
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium text-foreground">Signed in</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => void logout()}>
                <LogOut />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div></header>
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-7 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Megaphone className="size-4.5" />
            </span>
            <h1 className="text-[26px] font-semibold leading-8 tracking-tight text-foreground">Events</h1>
            {events && events.length > 0 ? (
              <Badge variant="secondary" className="tabular">
                {events.length}
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Pick an event to manage, or start a new one.</p>
        </div>
        <Button asChild>
          <Link to="/app/events/new">
            <Plus />
            Create event
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      ) : !events || events.length === 0 ? (
        <EmptyEvents />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div></div>
  );
}

function EventCard({ event }: { event: Event }) {
  const phase = phaseOf(event);

  return (
    <Link
      to={`/app/events/${event.id}/dashboard`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs",
        "transition-[box-shadow,transform,border-color] duration-150",
        "hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-lg",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35",
      )}
    >
      <div className="relative h-24 shrink-0" style={event.banner_file_id ? undefined : coverStyle(event.id)}>
        {event.banner_file_id && (
          <img
            src={filesApi.downloadUrl(event.banner_file_id)}
            alt=""
            className="size-full object-cover"
          />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
        {/* Glass chip: the cover is an arbitrary gradient, so the label can't
            rely on a theme surface behind it — a dark scrim reads on any hue.
            Tone is carried by the dot, not the text color. */}
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white ring-1 ring-white/15 backdrop-blur-sm">
          <span
            className={cn(
              "size-1.5 rounded-full",
              phase.tone === "live" && "bg-success",
              phase.tone === "soon" && "bg-white",
              phase.tone === "past" && "bg-white/50",
              phase.tone === "planning" && "bg-warning",
            )}
          />
          {phase.label}
        </span>
      </div>

      {/* Logo straddles the cover edge; -mt pulls it up over the banner. Needs
          `relative` so it out-paints the cover's absolute gradient overlay —
          non-positioned elements always paint below positioned siblings. */}
      <div className="relative z-10 -mt-6 px-4">
        <span className="flex size-12 items-center justify-center overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {event.logo_file_id ? (
            <img src={filesApi.downloadUrl(event.logo_file_id)} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-base font-semibold text-muted-foreground">
              {event.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4 pt-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-foreground">{event.name}</h2>
          {event.description ? (
            <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted-foreground">{event.description}</p>
          ) : null}
        </div>

        <dl className="mt-auto space-y-1.5 text-[13px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5 shrink-0" />
            <dd className="truncate tabular">{dateRange(event)}</dd>
          </div>
          {event.location ? (
            <div className="flex items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0" />
              <dd className="truncate">{event.location}</dd>
            </div>
          ) : null}
        </dl>

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <Badge variant="muted" className="capitalize">
            {event.type}
          </Badge>
          <span className="flex items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors group-hover:text-primary">
            Open
            <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function EmptyEvents() {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Sparkles className="size-6" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-foreground">Create your first event</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        An event holds your call for papers, submissions, reviewers, and the final agenda.
      </p>
      <Button asChild className="mt-5">
        <Link to="/app/events/new">
          <Plus />
          Create event
        </Link>
      </Button>
    </div>
  );
}
