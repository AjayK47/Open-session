import { Outlet, NavLink, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarSync, Home, FileText, User, ListChecks, FolderOpen, BookOpen, LogOut } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@opensession/ui";
import { publicApi } from "../api";
import { useAuth } from "../lib/auth";
import { EventMark, formatEventDates } from "../components/event-identity";
import { ThemeToggle } from "../components/theme-toggle";

/**
 * Speaker portal shell.
 *
 * The header names the *conference*, not the software: a speaker arrives here
 * from an acceptance email and needs to recognise the event instantly. Nav is a
 * row of underlined tabs so the active section is legible at a glance, and it
 * scrolls horizontally rather than wrapping on narrow phones — most speakers
 * open this on a phone.
 */
export function PortalShell() {
  const { eventSlug } = useParams<{ eventSlug: string }>();
  const { user, logout } = useAuth();
  const { data: event } = useQuery({
    queryKey: ["public-event", eventSlug],
    queryFn: () => publicApi.getEvent(eventSlug!),
    enabled: Boolean(eventSlug),
  });

  const nav = [
    { label: "Home", to: `/portal/${eventSlug}`, icon: Home, end: true },
    { label: "Submissions", to: `/portal/${eventSlug}/submissions`, icon: FileText },
    { label: "Tasks", to: `/portal/${eventSlug}/tasks`, icon: ListChecks },
    { label: "Files", to: `/portal/${eventSlug}/files`, icon: FolderOpen },
    { label: "Resources", to: `/portal/${eventSlug}/resources`, icon: BookOpen },
    { label: "Calendar", to: `/portal/${eventSlug}/calendar`, icon: CalendarSync },
    { label: "Profile", to: `/portal/${eventSlug}/profile`, icon: User },
  ];

  const dates = event ? formatEventDates(event) : null;
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="flex h-16 items-center gap-3">
            <EventMark logoUrl={event?.logo_url} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight text-foreground">
                {event?.name ?? "Speaker Portal"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {dates ? `Speaker portal · ${dates}` : "Speaker portal"}
              </p>
            </div>
            <ThemeToggle className="shrink-0" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account"
                  className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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

          <nav className="-mb-px flex items-center gap-1 overflow-x-auto">
            {nav.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40",
                    isActive
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={cn("size-4", isActive ? "text-primary" : "text-muted-foreground")} />
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
