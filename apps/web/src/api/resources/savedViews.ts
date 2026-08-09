import type { SavedView, SavedViewInput, SavedViewUpdateInput } from "@opensession/schemas";
import { http, qs } from "../client";

export const savedViewsApi = {
  list: (eventId: string, resourceType?: string) =>
    http.get<SavedView[]>(`/api/v1/events/${eventId}/saved-views${qs({ resource_type: resourceType })}`),
  create: (eventId: string, input: SavedViewInput) =>
    http.post<SavedView>(`/api/v1/events/${eventId}/saved-views`, input),
  update: (viewId: string, input: SavedViewUpdateInput) =>
    http.patch<SavedView>(`/api/v1/saved-views/${viewId}`, input),
  remove: (viewId: string) => http.delete<{ ok: boolean }>(`/api/v1/saved-views/${viewId}`),
};
