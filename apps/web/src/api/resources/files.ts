import type { FileComment, FileRecord, FileVersion, UploadIntentInput, UploadIntentResponse } from "@opensession/schemas";
import { apiUrl, http } from "../client";
import { meApi } from "./me";

export const filesApi = {
  list: (eventId: string, fileType?: string) =>
    http.get<FileRecord[]>(`/api/v1/events/${eventId}/files${fileType ? `?file_type=${fileType}` : ""}`),
  uploadIntent: (eventId: string, input: UploadIntentInput) =>
    http.post<UploadIntentResponse>(`/api/v1/events/${eventId}/files/upload-intent`, input),
  remove: (fileId: string) => http.delete<{ ok: boolean }>(`/api/v1/files/${fileId}`),
  versions: (fileId: string) => http.get<FileVersion[]>(`/api/v1/files/${fileId}/versions`),
  comments: (fileId: string) => http.get<FileComment[]>(`/api/v1/files/${fileId}/comments`),
  addComment: (fileId: string, body: string) =>
    http.post<FileComment>(`/api/v1/files/${fileId}/comments`, { body }),

  /** Uploads raw bytes for a previously-created upload-intent record, then marks it complete. */
  async uploadContent(fileId: string, file: File): Promise<void> {
    await http.postRaw(`/api/v1/files/${fileId}/content`, file);
    await http.post(`/api/v1/files/${fileId}/complete`);
  },

  downloadUrl: (fileId: string) => apiUrl(`/api/v1/files/${fileId}/download`),
  publicHeadshotUrl: (fileId: string) => apiUrl(`/api/v1/public/files/${fileId}/headshot`),
  bundleUrl: (eventId: string, fileIds: string[] = []) => {
    const params = new URLSearchParams();
    fileIds.forEach((id) => params.append("file_ids", id));
    return apiUrl(`/api/v1/events/${eventId}/files/bundle.zip${params.size ? `?${params}` : ""}`);
  },
};

/** End-to-end helper: create the intent (as an organizer), upload bytes, return the file id. */
export async function uploadFile(
  eventId: string,
  file: File,
  fileType: string,
  refs: { person_id?: string; submission_id?: string; session_id?: string; task_assignment_id?: string } = {},
): Promise<string> {
  const intent = await filesApi.uploadIntent(eventId, {
    filename: file.name,
    content_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    file_type: fileType,
    ...refs,
  });
  await filesApi.uploadContent(intent.id, file);
  return intent.id;
}

/**
 * Same flow via /api/v1/me/files/upload-intent — the endpoint speakers are actually
 * authorized to call (organizer upload-intent requires owner/admin, per §26 scoping).
 */
export async function uploadMyFile(
  eventId: string,
  file: File,
  fileType: string,
  refs: { submission_id?: string; session_id?: string; task_assignment_id?: string } = {},
): Promise<string> {
  const intent = await meApi.uploadIntent({
    event_id: eventId,
    filename: file.name,
    content_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    file_type: fileType,
    ...refs,
  });
  await filesApi.uploadContent(intent.id, file);
  return intent.id;
}
