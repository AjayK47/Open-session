import type {
  FieldDefinition,
  FieldDefinitionInput,
  FieldDefinitionUpdateInput,
  FileRequest,
  FileRequestInput,
  FileRequestUpdateInput,
  PortalForm,
  PortalFormInput,
  PortalFormUpdateInput,
  PortalResource,
  PortalResourceInput,
  PortalResourceUpdateInput,
  UploadIntentInput,
  UploadIntentResponse,
} from "@opensession/schemas";
import { http } from "../client";

/** Reusable field library — fields defined once per event and shared by forms. */
export const fieldDefinitionsApi = {
  list: (eventId: string) => http.get<FieldDefinition[]>(`/api/v1/events/${eventId}/field-definitions`),
  create: (eventId: string, input: FieldDefinitionInput) =>
    http.post<FieldDefinition>(`/api/v1/events/${eventId}/field-definitions`, input),
  update: (fieldId: string, input: FieldDefinitionUpdateInput) =>
    http.patch<FieldDefinition>(`/api/v1/field-definitions/${fieldId}`, input),
  remove: (fieldId: string) => http.delete<{ ok: boolean }>(`/api/v1/field-definitions/${fieldId}`),
};

/** Forms assigned to portals and completed from inside a task — distinct from
 *  the public CFP submission forms. */
export const portalFormsApi = {
  list: (eventId: string) => http.get<PortalForm[]>(`/api/v1/events/${eventId}/portal-forms`),
  create: (eventId: string, input: PortalFormInput) =>
    http.post<PortalForm>(`/api/v1/events/${eventId}/portal-forms`, input),
  get: (formId: string) => http.get<PortalForm>(`/api/v1/portal-forms/${formId}`),
  update: (formId: string, input: PortalFormUpdateInput) =>
    http.patch<PortalForm>(`/api/v1/portal-forms/${formId}`, input),
  duplicate: (formId: string) => http.post<PortalForm>(`/api/v1/portal-forms/${formId}/duplicate`),
  remove: (formId: string) => http.delete<{ ok: boolean }>(`/api/v1/portal-forms/${formId}`),
};

/** Wiki-style reference pages shown in the speaker portal (docx §8). */
export const portalResourcesApi = {
  list: (eventId: string) => http.get<PortalResource[]>(`/api/v1/events/${eventId}/resources`),
  listPublished: (eventId: string) =>
    http.get<PortalResource[]>(`/api/v1/events/${eventId}/resources/published`),
  create: (eventId: string, input: PortalResourceInput) =>
    http.post<PortalResource>(`/api/v1/events/${eventId}/resources`, input),
  update: (resourceId: string, input: PortalResourceUpdateInput) =>
    http.patch<PortalResource>(`/api/v1/resources/${resourceId}`, input),
  remove: (resourceId: string) => http.delete<void>(`/api/v1/resources/${resourceId}`),
};

export const fileRequestsApi = {
  list: (eventId: string) => http.get<FileRequest[]>(`/api/v1/events/${eventId}/file-requests`),
  create: (eventId: string, input: FileRequestInput) =>
    http.post<FileRequest>(`/api/v1/events/${eventId}/file-requests`, input),
  update: (requestId: string, input: FileRequestUpdateInput) =>
    http.patch<FileRequest>(`/api/v1/file-requests/${requestId}`, input),
  remove: (requestId: string) => http.delete<{ ok: boolean }>(`/api/v1/file-requests/${requestId}`),
  remind: (eventId: string, items: Array<{ request_id: string; person_id: string }>) =>
    http.post<{ sent: number }>(`/api/v1/events/${eventId}/file-requests/remind`, { items }),

  /** Speaker-facing: only requests for events the signed-in person belongs to. */
  mine: () => http.get<FileRequest[]>("/api/v1/me/file-requests"),
  uploadIntent: (requestId: string, input: UploadIntentInput) =>
    http.post<UploadIntentResponse>(`/api/v1/me/file-requests/${requestId}/upload-intent`, input),
};
