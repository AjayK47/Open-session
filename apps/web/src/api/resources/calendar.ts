import type { CalendarConnection, CalendarProvider } from "@opensession/schemas";
import { http } from "../client";

export const calendarApi = {
  connections: () => http.get<CalendarConnection[]>("/api/v1/calendar/connections"),
  start: (provider: CalendarProvider, returnPath: string) =>
    http.post<{ authorization_url: string }>(`/api/v1/calendar/oauth/${provider}/start`, {
      return_path: returnPath,
    }),
  sync: (connectionId: string) =>
    http.post<CalendarConnection>(`/api/v1/calendar/connections/${connectionId}/sync`),
  disconnect: (connectionId: string) =>
    http.delete<void>(`/api/v1/calendar/connections/${connectionId}`),
};
