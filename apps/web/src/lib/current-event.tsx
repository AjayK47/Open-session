import { createContext, useContext, type PropsWithChildren } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import type { Event } from "@opensession/schemas";
import { eventsApi } from "../api";

/**
 * "One event, one mental model" (product plan §1.2): every organizer page lives
 * inside an event, resolved once from the :eventId route param and made available
 * to the whole subtree without every page re-fetching it.
 */

interface CurrentEventContextValue {
  event: Event | undefined;
  eventId: string;
  isLoading: boolean;
  /** True when the event can't be loaded — missing, or the signed-in user has
   *  no role binding for it. Pages return null without an event, so the shell
   *  needs this to render an explanation instead of a blank screen. */
  isUnavailable: boolean;
}

const CurrentEventContext = createContext<CurrentEventContextValue | null>(null);

export function CurrentEventProvider({ children }: PropsWithChildren) {
  const { eventId } = useParams<{ eventId: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["events", eventId],
    queryFn: () => eventsApi.get(eventId!),
    enabled: Boolean(eventId),
    retry: false,
  });

  return (
    <CurrentEventContext.Provider
      value={{
        event: data,
        eventId: eventId ?? "",
        isLoading,
        isUnavailable: Boolean(eventId) && !isLoading && (isError || !data),
      }}
    >
      {children}
    </CurrentEventContext.Provider>
  );
}

export function useCurrentEvent(): CurrentEventContextValue {
  const ctx = useContext(CurrentEventContext);
  if (!ctx) throw new Error("useCurrentEvent must be used within CurrentEventProvider");
  return ctx;
}
