import type { ProfileUpdateInput, Speaker, SpeakerCreateInput, SpeakerOrganizerUpdateInput } from "@opensession/schemas";
import { http, qs } from "../client";

export const speakersApi = {
  list: (eventId: string, speakerStatus?: string, confirmationStatus?: string) =>
    http.get<Speaker[]>(`/api/v1/events/${eventId}/speakers${qs({ speaker_status: speakerStatus, confirmation_status: confirmationStatus })}`),
  get: (eventId: string, personId: string) => http.get<Speaker>(`/api/v1/events/${eventId}/speakers/${personId}`),
  create: (eventId: string, input: SpeakerCreateInput) =>
    http.post<Speaker>(`/api/v1/events/${eventId}/speakers`, input),
  organizerUpdate: (eventId: string, personId: string, input: SpeakerOrganizerUpdateInput) =>
    http.patch<Speaker>(`/api/v1/events/${eventId}/speakers/${personId}`, input),
  invite: (eventId: string, personId: string) =>
    http.post<{ sent: number; communication_id: string }>(`/api/v1/events/${eventId}/speakers/${personId}/invite`),
  importCsv: (eventId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return http.postForm<{ created: number; updated: number; errors: Array<{ row: number; message: string }> }>(
      `/api/v1/events/${eventId}/speakers/import`,
      body,
    );
  },
  update: (personId: string, input: ProfileUpdateInput) =>
    http.patch<{ person_id: string; email: string; first_name: string | null; last_name: string | null }>(
      `/api/v1/speakers/${personId}`,
      input,
    ),
};
