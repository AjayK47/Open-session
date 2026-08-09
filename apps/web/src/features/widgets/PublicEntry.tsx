import { Link, Navigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import type { PublicEventSummary } from "@opensession/schemas";
import { publicApi } from "../../api";
import { EventMark, formatEventDates } from "../../components/event-identity";

/** The five attendee surfaces, in the order the nav shows them. */
export type PublicSurface = "sessions" | "speakers" | "agenda" | "itinerary" | "gallery";

function usePublishedEvents() {
  return useQuery({ queryKey: ["public-events"], queryFn: publicApi.listEvents });
}

/**
 * Resolves a slugless public URL such as /agenda to a concrete event.
 *
 * Attendees arrive from a poster, a QR code or a search result and type the
 * obvious path — they don't know the event's slug. One published event sends
 * them straight through; several show a chooser rather than guessing.
 */
export function PublicSurfaceEntry({ surface }: { surface: PublicSurface }) {
  const { data: events, isLoading, isError } = usePublishedEvents();

  if (isLoading) return <Centered>Loading…</Centered>;
  if (isError) return <Centered>Couldn&apos;t load the programme. Try again shortly.</Centered>;
  if (!events || events.length === 0) return <NothingPublished />;
  if (events.length === 1) return <Navigate to={`/e/${events[0]!.slug}/${surface}`} replace />;

  return <EventChooser events={events} surface={surface} />;
}

/** Public root: the programme for anonymous visitors, with a way in for staff. */
export function PublicLandingPage() {
  const { data: events, isLoading } = usePublishedEvents();

  if (isLoading) return <Centered>Loading…</Centered>;
  if (events && events.length === 1) return <Navigate to={`/e/${events[0]!.slug}/sessions`} replace />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="flex items-center gap-3">
          <EventMark />
          <div>
            <h1 className="text-lg font-semibold">Open Session</h1>
            <p className="text-sm text-muted-foreground">Conference programmes, open to everyone.</p>
          </div>
        </div>

        {!events || events.length === 0 ? (
          <div className="mt-10">
            <NothingPublished inline />
          </div>
        ) : (
          <>
            <h2 className="mt-10 text-sm font-medium text-muted-foreground">Published programmes</h2>
            <ul className="mt-3 space-y-3">
              {events.map((event) => (
                <li key={event.id}>
                  <EventLink event={event} surface="sessions" />
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-10 text-sm text-muted-foreground">
          Organizing an event?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function EventChooser({ events, surface }: { events: PublicEventSummary[]; surface: PublicSurface }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-xl font-semibold">Choose an event</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          More than one programme is published. Pick the one you&apos;re attending.
        </p>
        <ul className="mt-6 space-y-3">
          {events.map((event) => (
            <li key={event.id}>
              <EventLink event={event} surface={surface} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EventLink({ event, surface }: { event: PublicEventSummary; surface: PublicSurface }) {
  const dates = formatEventDates(event);
  return (
    <Link
      to={`/e/${event.slug}/${surface}`}
      className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{event.name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          {dates && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" />
              {dates}
            </span>
          )}
          {event.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              {event.location}
            </span>
          )}
        </p>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function NothingPublished({ inline }: { inline?: boolean }) {
  const body = (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <p className="text-sm font-medium text-foreground">No programme is published yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Check back once the organizers publish their agenda.
      </p>
    </div>
  );
  return inline ? body : <div className="mx-auto max-w-lg px-4 py-20">{body}</div>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
