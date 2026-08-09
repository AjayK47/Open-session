import type {
  FileRecord,
  MyTask,
  SectionConfig,
  ProfileUpdateInput,
  Submission,
  SubmissionWriteInput,
  UploadIntentInput,
  UploadIntentResponse,
} from "@opensession/schemas";
import { http } from "../client";

export interface MyProfile {
  person_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  company: string | null;
  job_title: string | null;
  phone: string | null;
  website: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  headshot_file_id: string | null;
  files: { id: string; filename: string; file_type: string; size_bytes: number }[];
}

export interface MySession {
  id: string;
  event_id: string;
  title: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  room_name: string | null;
  track_name: string | null;
  role: string;
}

export interface MyTaskForm {
  assignment_id: string;
  form: {
    id: string;
    name: string;
    description: string | null;
    sections: SectionConfig[];
    settings: Record<string, unknown>;
  };
  answers: Record<string, unknown>;
  status: string;
}

export const meApi = {
  profile: () => http.get<MyProfile>("/api/v1/me/profile"),
  updateProfile: (input: ProfileUpdateInput) => http.patch<MyProfile>("/api/v1/me/profile", input),
  submissions: () => http.get<Submission[]>("/api/v1/me/submissions"),
  /** Speakers may edit after acceptance; the API returns 409 with a reason when locked. */
  editSubmission: (submissionId: string, input: SubmissionWriteInput) =>
    http.patch<Submission>(`/api/v1/me/submissions/${submissionId}`, input),
  tasks: () => http.get<MyTask[]>("/api/v1/me/tasks"),
  completeTask: (assignmentId: string, completionData?: Record<string, unknown>) =>
    http.post<{ id: string; status: string; completed_at: string | null }>(
      `/api/v1/me/tasks/${assignmentId}/complete`,
      { completion_data: completionData },
    ),
  /** Envelope, not a bare form — it carries the answers already saved for *this*
   *  assignment so a partly-filled form reopens where the speaker left it. */
  taskForm: (assignmentId: string) => http.get<MyTaskForm>(`/api/v1/me/tasks/${assignmentId}/form`),
  submitTaskForm: (assignmentId: string, answers: Record<string, unknown>) =>
    http.post<{ id: string; status: string }>(`/api/v1/me/tasks/${assignmentId}/submit-form`, { answers }),
  sessions: () => http.get<MySession[]>("/api/v1/me/sessions"),
  files: () => http.get<FileRecord[]>("/api/v1/me/files"),
  uploadIntent: (input: UploadIntentInput & { event_id: string }) =>
    http.post<UploadIntentResponse>("/api/v1/me/files/upload-intent", input),
};
