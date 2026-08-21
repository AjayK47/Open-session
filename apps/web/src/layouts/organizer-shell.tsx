import { Outlet, Link, NavLink } from "react-router";
import { HelpCircle, LogOut, Megaphone, ExternalLink, SearchX } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@opensession/ui";
import { NAV_GROUPS } from "./nav-config";
import { CurrentEventProvider, useCurrentEvent } from "../lib/current-event";
import { useAuth } from "../lib/auth";
import { useOrganizationContext } from "../lib/organization";
import { CommandPalette } from "../components/command-palette";
import { EventSwitcher } from "../components/event-switcher";
import { OrganizationSwitcher } from "../components/organization-switcher";
import { ThemeToggle } from "../components/theme-toggle";

/**
 * Organizer chrome.
 *
 * Scroll model: exactly one scroll container (`<main>`). The sidebar is its own
 * independent scroller because it's outside that flow, but page content never
 * nests a second vertical scroller inside main — sub-layouts use `sticky`
 * instead. Nested scrollers were what clipped wizard rails and footers.
 */
function EventUnavailable() {
  return (
    <div className="flex min-h-full items-center justify-center px-6 py-16">
      <div className="flex max-w-md flex-col items-center text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-warning/12 text-warning">
          <SearchX className="size-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-foreground">This event isn't available</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          It may have been deleted, or your account may not have access to it. Ask an organizer to invite you, or pick a
          different event.
        </p>
        <Button asChild className="mt-5">
          <Link to="/app/events">Back to events</Link>
        </Button>
      </div>
    </div>
  );
}

function ShellInner() {
  const { event, eventId, isLoading, isUnavailable } = useCurrentEvent();
  const { user, logout } = useAuth();
  const { data: orgContext } = useOrganizationContext();

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();
  const organizations = orgContext?.organizations ?? [];

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-[17.5rem] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        {organizations.length > 1 ? (
          <div className="flex h-9 items-center gap-2 border-b border-sidebar-border/70 px-3">
            <OrganizationSwitcher
              currentOrganizationId={orgContext?.organization?.id}
              currentOrganizationName={orgContext?.organization?.name}
              organizations={organizations}
            />
          </div>
        ) : null}
        <div className="flex h-14 items-center gap-2 px-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-xs">
            <Megaphone className="size-4" />
          </span>
          <EventSwitcher currentEventId={eventId} currentEventName={event?.name} isLoading={isLoading} />
        </div>

        <nav className="scrollbar-subtle flex-1 overflow-y-auto px-3 pb-4">
          {NAV_GROUPS.map((group, i) => (
            <div key={i} className={cn(i > 0 && "mt-5")}>
              {group.title ? (
                <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.055em] text-muted-foreground/80">
                  {group.title}
                </p>
              ) : null}
              <div className="flex flex-col gap-px">
                {group.items.map((item) => (
                  <NavLink
                    key={item.label}
                    to={item.to(eventId)}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-sm transition-colors duration-100 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
                        isActive
                          ? "bg-card font-medium text-foreground shadow-xs ring-1 ring-border/70"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")}
                        />
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur">
          <CommandPalette eventId={eventId} />
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/portal/${event?.slug ?? ""}`} target="_blank" rel="noreferrer">
                Speaker Portal
                <ExternalLink />
              </Link>
            </Button>
            <Button variant="ghost" size="icon-sm" asChild>
              <a
                href="https://sessionboard.mintlify.app/introduction"
                target="_blank"
                rel="noreferrer"
                aria-label="Help"
              >
                <HelpCircle />
              </a>
            </Button>
            <ThemeToggle />
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
        </header>

        <main className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto">
          {isUnavailable ? <EventUnavailable /> : <Outlet />}
        </main>
      </div>
    </div>
  );
}

export function OrganizerShell() {
  return (
    <CurrentEventProvider>
      <ShellInner />
    </CurrentEventProvider>
  );
}

// Page chrome lives in ./page; re-exported here so existing page imports resolve.
export { PageHeader, PageBody, Section } from "./page";
