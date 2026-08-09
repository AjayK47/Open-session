import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { publicApi } from "../../api";

/** Resolves the :eventSlug route param to an event id so /me/* data (which spans
 * every event a speaker has touched) can be filtered down to just this event. */
export function usePortalEvent() {
  const { eventSlug } = useParams<{ eventSlug: string }>();
  const { data: event, isLoading } = useQuery({
    queryKey: ["public-event", eventSlug],
    queryFn: () => publicApi.getEvent(eventSlug!),
    enabled: Boolean(eventSlug),
  });
  return { event, eventSlug: eventSlug ?? "", isLoading };
}
