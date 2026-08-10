import type { CalendarAvailability, CalendarConnection, CalendarProvider } from "@opensession/schemas";
import { http } from "../client";

export const calendarApi = {
  availability: () => http.get<CalendarAvailability>("/api/v1/calendar/availability"),
  connections: () => http.get<CalendarConnection[]>("/api/v1/calendar/connections"),
  start: (provider: CalendarProvider, returnPath: string) =>
    http.post<{ authorization_url: string }>(`/api/v1/calendar/composio/${provider}/start`, {
      return_path: returnPath,
    }),
  complete: (provider: CalendarProvider, connectedAccountId: string) =>
    http.post<CalendarConnection>(`/api/v1/calendar/composio/${provider}/complete`, {
      connected_account_id: connectedAccountId,
    }),
  sync: (connectionId: string) =>
    http.post<CalendarConnection>(`/api/v1/calendar/connections/${connectionId}/sync`),
  disconnect: (connectionId: string) =>
    http.delete<void>(`/api/v1/calendar/connections/${connectionId}`),
};
