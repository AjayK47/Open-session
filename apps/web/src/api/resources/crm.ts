import { http, qs } from "../client";

export interface CrmContact {
  id: string;
  primary_email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  headshot_file_id: string | null;
  tags: string[];
  event_count: number;
}

export interface CrmContactEvent {
  event_id: string;
  event_name: string;
  speaker_status: string;
  confirmation_status: string;
}

export interface CrmContactNote {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface CrmContactProfile extends CrmContact {
  bio: string | null;
  phone: string | null;
  website: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  events: CrmContactEvent[];
  notes: CrmContactNote[];
}

export interface CrmDashboard {
  total_contacts: number;
  total_events: number;
  returning_speakers: number;
  top_companies: { name: string; count: number }[];
}

export interface CrmImportResult {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
}

export interface CrmBulkEmailResult {
  sent: number;
  failed: string[];
  sent_at: string;
}

export const crmApi = {
  list: (filters: { search?: string; company?: string; job_title?: string; tag?: string } = {}) =>
    http.get<CrmContact[]>(`/api/v1/crm/people${qs(filters)}`),
  dashboard: () => http.get<CrmDashboard>("/api/v1/crm/dashboard"),
  profile: (personId: string) => http.get<CrmContactProfile>(`/api/v1/crm/people/${personId}`),
  addNote: (personId: string, body: string) =>
    http.post<CrmContactNote>(`/api/v1/crm/people/${personId}/notes`, { body }),
  setTags: (personId: string, tags: string[]) =>
    http.patch<CrmContact>(`/api/v1/crm/people/${personId}/tags`, { tags }),
  pushToEvent: (personId: string, eventId: string) =>
    http.post<CrmContact & { event_id: string; event_name: string }>(`/api/v1/crm/people/${personId}/add-to-event`, {
      event_id: eventId,
    }),
  importCsv: (file: File) => {
    const form = new FormData();
    form.set("file", file);
    return http.postForm<CrmImportResult>("/api/v1/crm/import", form);
  },
  bulkEmail: (personIds: string[], subject: string, bodyHtml: string) =>
    http.post<CrmBulkEmailResult>("/api/v1/crm/bulk-email", { person_ids: personIds, subject, body_html: bodyHtml }),
};
