/**
 * TypeScript types mirroring the real FastAPI backend contract (apps/api), extracted
 * from its live OpenAPI schema plus the plain-dict view functions in the routers/
 * services that don't have a Pydantic response_model. These are read/write shapes,
 * not runtime-validated — the backend is the source of truth; Zod is used separately
 * (see forms.ts) for validating what we send back from React Hook Form.
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  person_id: string | null;
}

export interface RequestCodeResponse {
  message: string;
  dev_code?: string | null;
}

export type EvaluationPersonaName = "organizer" | "speaker" | "reviewer";

export interface EvaluationPersona {
  persona: EvaluationPersonaName;
  label: string;
  email: string;
  start_path: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  website_url: string | null;
  description: string | null;
  default_timezone: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationContext {
  organization: Organization | null;
  membership_role: "owner" | "admin" | "member" | null;
  needs_onboarding: boolean;
  pending_invitation_count: number;
}

export interface OrganizationInput {
  name: string;
  slug: string;
  website_url?: string | null;
  description?: string | null;
  default_timezone: string;
}

export interface OrganizationMember {
  user_id: string;
  email: string;
  role: "owner" | "admin" | "member";
  status: string;
  created_at: string;
}

export interface OrganizationInvitation {
  id: string;
  email: string;
  role: "admin" | "member";
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: string;
  created_at: string;
  invite_url: string | null;
}

export type CalendarProvider = "google" | "microsoft";

export interface CalendarConnection {
  id: string;
  provider: CalendarProvider;
  provider_account_email: string | null;
  status: "active" | "error" | string;
  last_error: string | null;
  last_synced_at: string | null;
  synced_events: number;
  failed_events: number;
  created_at: string;
}

export interface CalendarAvailability {
  enabled: boolean;
  providers: CalendarProvider[];
}

// ---------------------------------------------------------------------------
// Events & program config
// ---------------------------------------------------------------------------

export type EventType = "conference" | "meetup" | "summit" | string;
export type EventStatus = "draft" | "active" | "archived" | string;

export interface Event {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  type: string;
  website_url: string | null;
  location: string | null;
  timezone: string;
  starts_at: string | null;
  ends_at: string | null;
  description: string | null;
  logo_file_id: string | null;
  banner_file_id: string | null;
  status: string;
  email_sender_name: string | null;
  email_sender_address: string | null;
  reply_to: string | null;
  agenda_published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgramSeedTrack {
  name: string;
  description?: string | null;
  color?: string | null;
}
export interface ProgramSeedRoom {
  name: string;
  location?: string | null;
  capacity?: number | null;
}
export interface ProgramSeedFormat {
  name: string;
  default_duration_minutes?: number | null;
}
export interface ProgramSeedTag {
  name: string;
}
export interface ProgramSeed {
  tracks?: ProgramSeedTrack[];
  rooms?: ProgramSeedRoom[];
  formats?: ProgramSeedFormat[];
  tags?: ProgramSeedTag[];
}

export interface PublicEventSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  location: string | null;
  timezone: string;
  starts_at: string | null;
  ends_at: string | null;
  logo_url: string | null;
  banner_url: string | null;
}

export interface EventCreateInput {
  name: string;
  slug: string;
  type?: string;
  website_url?: string | null;
  location?: string | null;
  timezone: string;
  starts_at?: string | null;
  ends_at?: string | null;
  description?: string | null;
  email_sender_name?: string | null;
  email_sender_address?: string | null;
  reply_to?: string | null;
  program?: ProgramSeed | null;
}

export type EventUpdateInput = Partial<
  Omit<EventCreateInput, "slug" | "program"> & {
    slug?: string | null;
    logo_file_id?: string | null;
    banner_file_id?: string | null;
  }
>;

export interface Track {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  color: string | null;
  serial_schedule: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}
export interface TrackInput {
  name: string;
  description?: string | null;
  color?: string | null;
  serial_schedule?: boolean;
  active?: boolean;
}

export interface Room {
  id: string;
  event_id: string;
  name: string;
  location: string | null;
  capacity: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export interface RoomInput {
  name: string;
  location?: string | null;
  capacity?: number | null;
  notes?: string | null;
}

export interface SessionFormat {
  id: string;
  event_id: string;
  name: string;
  default_duration_minutes: number | null;
  created_at: string;
  updated_at: string;
}
export interface SessionFormatInput {
  name: string;
  default_duration_minutes?: number | null;
}

export interface Tag {
  id: string;
  event_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}
export interface TagInput {
  name: string;
}

// ---------------------------------------------------------------------------
// Team & API keys
// ---------------------------------------------------------------------------

export type EventRole = "owner" | "admin" | "reviewer" | "speaker";

export interface TeamMember {
  user_id: string;
  email: string | null;
  role: EventRole;
}

export interface ApiKey {
  id: string;
  event_id: string | null;
  name: string;
  scopes: string[];
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
}
export interface ApiKeyCreated extends Omit<ApiKey, "event_id"> {
  key: string;
}

// ---------------------------------------------------------------------------
// Submission forms (CFP builder)
// ---------------------------------------------------------------------------

export type FieldType =
  | "system"
  | "short_text"
  | "long_text"
  | "number"
  | "url"
  | "email"
  | "dropdown"
  | "multi_select"
  | "radio"
  | "checkbox"
  | "date"
  | "file";

export interface FieldConfig {
  key: string;
  label: string;
  field_type?: FieldType | string;
  system_field?: string | null;
  help_text?: string | null;
  required?: boolean;
  placeholder?: string | null;
  options?: string[];
  min_length?: number | null;
  max_length?: number | null;
  default_value?: unknown;
}

export interface SectionConfig {
  key: string;
  title: string;
  instructions?: string | null;
  fields?: FieldConfig[];
}

export interface ParticipantRoleConfig {
  role: string;
  min?: number;
  max?: number;
}

export type ConditionOperator = "equals" | "not_equals" | "contains" | "any_of" | "is_set" | "is_not_set";
export type ConditionalActionKind = "show" | "hide" | "require";

export interface RuleActionConfig {
  kind: ConditionalActionKind | string;
  target: string;
}
export interface ConditionalRuleConfig {
  id?: string | null;
  field: string;
  operator: ConditionOperator | string;
  value?: unknown;
  actions?: RuleActionConfig[];
}

export type RoutingActionKind = "assign_track" | "add_tag" | "assign_evaluation_plan" | "assign_owner";
export interface RoutingTriggerConfig {
  field: string;
  operator: ConditionOperator | string;
  value?: unknown;
}
export interface RoutingActionConfig {
  kind: RoutingActionKind | string;
  value?: unknown;
}
export interface RoutingRuleConfig {
  id?: string | null;
  trigger: RoutingTriggerConfig;
  actions?: RoutingActionConfig[];
}

export type SubmissionFormStatus = "draft" | "open" | "closed";
export type SubmissionType = "abstract" | "session";

export interface SubmissionForm {
  id: string;
  event_id: string;
  internal_name: string;
  public_title: string;
  slug: string;
  submission_type: SubmissionType | string;
  status: SubmissionFormStatus | string;
  open_at: string | null;
  close_at: string | null;
  submission_limit: number | null;
  allow_multiple: boolean;
  allow_drafts: boolean;
  participant_roles: ParticipantRoleConfig[];
  sections: SectionConfig[];
  conditional_rules: ConditionalRuleConfig[];
  routing_rules: RoutingRuleConfig[];
  edit_locked_after: string | null;
  success_message_html: string | null;
  auto_redirect_portal: boolean;
  confirmation_template_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmissionFormInput {
  internal_name: string;
  public_title: string;
  slug: string;
  submission_type?: SubmissionType | string;
  participant_roles?: ParticipantRoleConfig[];
  sections?: SectionConfig[];
  conditional_rules?: ConditionalRuleConfig[];
  routing_rules?: RoutingRuleConfig[];
  open_at?: string | null;
  close_at?: string | null;
  submission_limit?: number | null;
  allow_multiple?: boolean;
  allow_drafts?: boolean;
  auto_redirect_portal?: boolean;
  success_message_html?: string | null;
  confirmation_template_id?: string | null;
}
export type SubmissionFormUpdateInput = Partial<SubmissionFormInput>;

export interface PublicOption {
  id: string;
  name: string;
}

export interface PublicForm {
  id: string;
  event: { name: string; slug: string; description: string | null };
  public_title: string;
  submission_type: string;
  status: string;
  open_at: string | null;
  close_at: string | null;
  submission_limit: number | null;
  accepting_submissions: boolean;
  closed_reason: string | null;
  sections: SectionConfig[];
  /** Show/hide and force-required rules, evaluated client-side as the speaker types. */
  conditional_rules: ConditionalRuleConfig[];
  participant_roles: ParticipantRoleConfig[];
  success_message_html: string | null;
  tracks: PublicOption[];
  formats: PublicOption[];
  tags: PublicOption[];
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

export type SubmissionStatus =
  | "draft"
  | "submitted"
  | "pending_review"
  | "accept_queue"
  | "decline_queue"
  | "accepted"
  | "declined"
  | "withdrawn";

export interface Participant {
  id: string;
  person_id: string;
  role: string;
  sort_order: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  bio: string | null;
}
export interface ParticipantInput {
  email: string;
  role: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  job_title?: string | null;
  bio?: string | null;
}

export interface ReviewSummary {
  total: number;
  completed: number;
  completion_percent: number;
  aggregate_rating: number | null;
  reviews: { assignment_id: string; weighted_score: number | null; comments: string | null; submitted_at: string | null }[];
}

export interface Submission {
  id: string;
  event_id: string;
  form_id: string | null;
  submitter_person_id: string | null;
  status: SubmissionStatus | string;
  title: string | null;
  description: string | null;
  /** Primary track. Always the first entry of `track_ids` when any are set. */
  track_id: string | null;
  /** Every track the talk was submitted to, primary first. */
  track_ids: string[];
  format_id: string | null;
  level: string | null;
  custom_answers: Record<string, unknown>;
  tags: string[];
  capacity: number | null;
  ceu_credits: number | null;
  client_session_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  language: string | null;
  reference_code: string | null;
  owner_person_id: string | null;
  aggregate_rating: number | null;
  notified: boolean;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  participants?: Participant[];
  review_summary?: ReviewSummary | null;
  can_edit: boolean;
  edit_lock_reason: string | null;
}

export interface SubmissionWriteInput {
  title?: string | null;
  description?: string | null;
  format_id?: string | null;
  track_id?: string | null;
  /** Multi-track selection; the first entry becomes the primary `track_id`. */
  track_ids?: string[] | null;
  level?: string | null;
  capacity?: number | null;
  ceu_credits?: number | null;
  client_session_id?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  language?: string | null;
  custom_answers?: Record<string, unknown>;
  participants?: ParticipantInput[];
}

export interface ManualSubmissionInput {
  form_id?: string | null;
  status?: string | null;
  title: string;
  description?: string | null;
  track_id?: string | null;
  track_ids?: string[] | null;
  format_id?: string | null;
  level?: string | null;
  tags?: string[];
  capacity?: number | null;
  ceu_credits?: number | null;
  client_session_id?: string | null;
  language?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  custom_answers?: Record<string, unknown>;
  participants?: ParticipantInput[];
}

export type SubmissionUpdateInput = Partial<Omit<ManualSubmissionInput, "form_id">>;

export interface SubmitResponse {
  id: string;
  status: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Evaluations
// ---------------------------------------------------------------------------

export type CriterionType = "numeric" | "dropdown" | "yes_no" | "text";
export interface CriterionConfig {
  key: string;
  label: string;
  description?: string | null;
  type?: CriterionType | string;
  options?: string[];
  scale_max?: number;
  weight?: number;
  required?: boolean;
}

export interface PlanScope {
  form_id?: string | null;
  track_ids?: string[];
}

export interface EvaluationPlan {
  id: string;
  event_id: string;
  name: string;
  instructions: string | null;
  scope: PlanScope;
  criteria: CriterionConfig[];
  reviews_required: number;
  blind_review: boolean;
  round_number: number;
  opens_at: string | null;
  closes_at: string | null;
  assigned_submissions: number;
  completed_reviews: number;
  in_progress_reviews: number;
  created_at: string;
  updated_at: string;
}

export interface EvaluationPlanInput {
  name: string;
  instructions?: string | null;
  scope?: PlanScope;
  criteria?: CriterionConfig[];
  reviews_required?: number;
  blind_review?: boolean;
  round_number?: number;
  opens_at?: string | null;
  closes_at?: string | null;
}
export type EvaluationPlanUpdateInput = Partial<EvaluationPlanInput>;

export type ReviewAssignmentStatus = "assigned" | "in_progress" | "completed";

export interface ReviewerAssignment {
  id: string;
  submission_id: string;
  title: string | null;
  track_id: string | null;
  status: ReviewAssignmentStatus | string;
  due_at: string | null;
  plan_id: string | null;
  plan_name: string | null;
  scores: Record<string, unknown>;
  comments: string | null;
}

export interface ReviewWriteInput {
  scores?: Record<string, unknown>;
  comments?: string | null;
  submit?: boolean;
}

export interface ReviewerProgress {
  person_id: string;
  email: string;
  name: string;
  assigned: number;
  completed: number;
  recused: number;
  outstanding: number;
  percent: number;
}

export interface EvaluationResult {
  submission_id: string;
  reference_code: string | null;
  title: string | null;
  status: string;
  assigned: number;
  completed: number;
  recused: number;
  outstanding: number;
  aggregate_score: number | null;
  speakers: { name: string; role: string }[];
}

export interface AiReviewCriterion {
  key: string;
  score: number | null;
  rationale: string;
  flags: string[];
}

export interface AiReviewRun {
  id: string;
  event_id: string;
  evaluation_plan_id: string;
  submission_id: string;
  status: "running" | "completed" | "failed" | string;
  model: string;
  provider_response_id: string | null;
  prompt_version: string;
  rubric_version: string;
  criteria: AiReviewCriterion[];
  overall_score: number | null;
  rationale: string | null;
  flags: string[];
  input_tokens: number | null;
  output_tokens: number | null;
  error: string | null;
  override_score: number | null;
  override_reason: string | null;
  override_by_user_id: string | null;
  overridden_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Sessions & agenda
// ---------------------------------------------------------------------------

export type SessionStatus = "draft" | "confirmed" | "scheduled" | "published" | "cancelled";

export interface SessionParticipant {
  person_id: string;
  role: string;
  sort_order?: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
}

export interface ProgramSession {
  id: string;
  event_id: string;
  source_submission_id: string | null;
  title: string;
  description: string | null;
  status: SessionStatus | string;
  approval_status: "pending" | "approved" | "rejected" | string;
  track_id: string | null;
  format_id: string | null;
  duration_minutes: number | null;
  room_id: string | null;
  room_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  calendar_sequence: number | null;
  capacity: number | null;
  ceu_credits: number | null;
  chairperson: string | null;
  language: string | null;
  location: string | null;
  participants: SessionParticipant[];
}

export interface SessionParticipantInput {
  email: string;
  role?: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  job_title?: string | null;
}

export interface SessionCreateInput {
  title: string;
  description?: string | null;
  track_id?: string | null;
  format_id?: string | null;
  duration_minutes?: number | null;
  participants?: SessionParticipantInput[];
}
export interface SessionUpdateInput {
  title?: string | null;
  status?: SessionStatus | string;
  approval_status?: "pending" | "approved" | "rejected";
  description?: string | null;
  track_id?: string | null;
  format_id?: string | null;
  duration_minutes?: number | null;
  capacity?: number | null;
  ceu_credits?: number | null;
  chairperson?: string | null;
  language?: string | null;
  location?: string | null;
  participants?: SessionParticipantInput[];
}
export interface SessionRevision {
  id: string;
  editor_name: string;
  changed_fields: string[];
  snapshot: Record<string, unknown>;
  created_at: string;
}
export interface ScheduleInput {
  room_id?: string | null;
  starts_at: string;
  ends_at: string;
  allow_soft?: boolean;
}

export interface AgendaItem {
  id: string;
  title: string;
  status: string;
  track_id: string | null;
  track_name: string | null;
  format_id: string | null;
  room_id: string | null;
  room_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  duration_minutes: number | null;
  participants: { person_id: string; role: string; email: string; first_name: string | null; last_name: string | null }[];
}

export type ConflictKind =
  | "room_collision"
  | "speaker_collision"
  | "track_collision"
  | "event_boundary"
  | "invalid_duration";
export type ConflictSeverity = "hard" | "soft";

export interface Conflict {
  kind: ConflictKind | string;
  sessions: string[];
  severity: ConflictSeverity | string;
  detail: string;
  persons?: string[];
}

// ---------------------------------------------------------------------------
// Speakers
// ---------------------------------------------------------------------------

export type SpeakerStatus = "none" | "accepted" | string;
export type ConfirmationStatus = "unconfirmed" | "confirmed" | string;

export interface SpeakerSessionSummary {
  id: string;
  title: string;
  status: string;
  room_id: string | null;
  room_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
}
export interface SpeakerTaskSummary {
  id: string;
  name: string | null;
  status: string;
  due_at: string | null;
  completed_at: string | null;
}
export interface SpeakerFileSummary {
  id: string;
  filename: string;
  file_type: string;
  size_bytes: number;
}

export interface Speaker {
  person_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  bio: string | null;
  phone: string | null;
  website: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  headshot_file_id: string | null;
  speaker_status: SpeakerStatus;
  confirmation_status: ConfirmationStatus;
  custom_fields: Record<string, unknown>;
  profile_completion_percent: number;
  onboarding_completion_percent: number;
  sessions: SpeakerSessionSummary[];
  tasks: SpeakerTaskSummary[];
  total_tasks: number;
  completed_tasks: number;
  outstanding_tasks: number;
  files: SpeakerFileSummary[];
}

export interface SpeakerCreateInput extends ProfileUpdateInput {
  email: string;
  speaker_status?: string;
  confirmation_status?: string;
  custom_fields?: Record<string, unknown>;
}

export interface SpeakerOrganizerUpdateInput extends ProfileUpdateInput {
  speaker_status?: string;
  confirmation_status?: string;
  custom_fields?: Record<string, unknown>;
}

export interface ProfileUpdateInput {
  first_name?: string | null;
  last_name?: string | null;
  bio?: string | null;
  company?: string | null;
  job_title?: string | null;
  phone?: string | null;
  website?: string | null;
  linkedin_url?: string | null;
  x_url?: string | null;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskType = "confirmation" | "profile" | "file_upload" | "form" | "custom";

export interface TaskTemplate {
  id: string;
  event_id: string;
  name: string;
  instructions: string | null;
  task_type: TaskType | string;
  required: boolean;
  due_rule: Record<string, unknown>;
  applies_when: Record<string, unknown>;
  target_type: TaskTargetType | string;
  portal_form_id: string | null;
}
export interface TaskTemplateInput {
  name: string;
  instructions?: string | null;
  task_type?: TaskType | string;
  required?: boolean;
  due_rule?: Record<string, unknown>;
  applies_when?: Record<string, unknown>;
  target_type?: TaskTargetType | string;
  portal_form_id?: string | null;
}
export type TaskTemplateUpdateInput = Partial<TaskTemplateInput>;

export type TaskAssignmentStatus = "open" | "completed" | "overdue";

export interface TaskAssignment {
  id: string;
  event_id: string;
  template_id: string | null;
  name: string;
  person_id: string;
  person_email: string | null;
  person_name: string | null;
  session_id: string | null;
  submission_id: string | null;
  status: TaskAssignmentStatus | string;
  due_at: string | null;
  completed_at: string | null;
}

export interface MyTask {
  id: string;
  event_id: string;
  name: string;
  instructions: string | null;
  task_type: TaskType | string;
  status: string;
  due_at: string | null;
  completed_at: string | null;
  session_id: string | null;
  submission_id: string | null;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export type FileType = "headshot" | "slides" | "supporting" | "submission";

export interface FileRecord {
  id: string;
  event_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  file_type: FileType | string;
  person_id: string | null;
  submission_id: string | null;
  session_id: string | null;
  task_assignment_id: string | null;
  file_request_id: string | null;
  uploaded_at: string;
  version: number;
  is_latest: boolean;
  replaces_file_id: string | null;
  person_name?: string | null;
  person_email?: string | null;
  session_title?: string | null;
  request_title?: string | null;
  request_due_at?: string | null;
  task_name?: string | null;
}

export interface FileVersion {
  id: string;
  filename: string;
  version: number;
  is_latest: boolean;
  size_bytes: number;
  uploaded_at: string;
  download_url: string;
}

export interface FileComment {
  id: string;
  author_name: string;
  author_person_id?: string | null;
  body: string;
  created_at: string;
}

export interface UploadIntentInput {
  filename: string;
  content_type: string;
  size_bytes?: number | null;
  file_type: FileType | string;
  person_id?: string | null;
  submission_id?: string | null;
  session_id?: string | null;
  task_assignment_id?: string | null;
  file_request_id?: string | null;
}

export interface UploadIntentResponse {
  id: string;
  upload_url: string;
}

// ---------------------------------------------------------------------------
// Communications
// ---------------------------------------------------------------------------

export type EmailTemplateType =
  | "submission_received"
  | "submission_accepted"
  | "submission_declined"
  | "task_reminder"
  | "speaker_confirmation"
  | "session_scheduled"
  | "session_schedule_changed"
  | "calendar_invite"
  | string;

export interface EmailTemplate {
  id: string;
  event_id: string;
  name: string;
  type: EmailTemplateType;
  subject_template: string;
  html_template: string;
  text_template: string | null;
}
export interface EmailTemplateInput {
  name: string;
  type: string;
  subject_template: string;
  html_template: string;
  text_template?: string | null;
}
export type EmailTemplateUpdateInput = Partial<Omit<EmailTemplateInput, "type">>;

export type AutomationTrigger =
  | "submission_received"
  | "submission_accepted"
  | "submission_declined"
  | "task_assigned"
  | "task_overdue"
  | "session_scheduled"
  | "session_schedule_changed"
  | string;

export interface Automation {
  id: string;
  event_id: string;
  trigger_type: AutomationTrigger;
  conditions: Record<string, unknown>;
  template_id: string | null;
  include_calendar_invite: boolean;
  enabled: boolean;
}
export interface AutomationInput {
  trigger_type: string;
  conditions?: Record<string, unknown>;
  template_id?: string | null;
  include_calendar_invite?: boolean;
  enabled?: boolean;
}
export type AutomationUpdateInput = Partial<AutomationInput>;

export type CommunicationStatus = "queued" | "sending" | "sent" | "failed";

export interface Communication {
  id: string;
  event_id: string;
  recipient_person_id: string | null;
  recipient_email: string;
  template_id: string | null;
  related_submission_id: string | null;
  related_session_id: string | null;
  related_task_assignment_id: string | null;
  status: CommunicationStatus | string;
  provider_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ManualSendInput {
  template_id?: string | null;
  subject?: string | null;
  html?: string | null;
  recipients: string[];
  related_submission_id?: string | null;
  related_session_id?: string | null;
}

export interface ManualSendPreview {
  recipient_email: string;
  recipient_name: string;
  subject: string;
  html: string;
}

// ---------------------------------------------------------------------------
// Saved views
// ---------------------------------------------------------------------------

export interface SavedView {
  id: string;
  event_id: string;
  owner_person_id: string;
  resource_type: string;
  name: string;
  filters: Record<string, unknown>;
  sorts: { id: string; desc: boolean }[];
  columns: string[];
}
export interface SavedViewInput {
  resource_type: string;
  name: string;
  filters?: Record<string, unknown>;
  sorts?: { id: string; desc: boolean }[];
  columns?: string[];
}
export type SavedViewUpdateInput = Partial<Omit<SavedViewInput, "resource_type">>;

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface EventMetrics {
  total_submissions: number;
  pending_review: number;
  accepted_submissions: number;
  accepted_speakers: number;
  scheduled_sessions: number;
  unscheduled_sessions: number;
  outstanding_tasks: number;
  overdue_tasks: number;
}

export interface OnboardingSpeaker {
  person_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  profile_completion_percent: number;
  onboarding_completion_percent: number;
  outstanding_tasks: number;
  missing_headshot: boolean;
  missing_slides: boolean;
}

export interface OnboardingDashboard {
  total_accepted_speakers: number;
  fully_ready: number;
  outstanding: number;
  average_completion_percent: number;
  outstanding_by_task: Record<string, number>;
  speakers: OnboardingSpeaker[];
}

// ---------------------------------------------------------------------------
// Portal forms, field library, file requests (backend plan B7–B9)
// ---------------------------------------------------------------------------

export type TaskTargetType = "contact" | "group" | "submission";

export interface FieldDefinition {
  id: string;
  event_id: string;
  key: string;
  label: string;
  field_type: string;
  config: Record<string, unknown>;
  locked: boolean;
}
export interface FieldDefinitionInput {
  key: string;
  label: string;
  field_type: string;
  config?: Record<string, unknown>;
  locked?: boolean;
}
export type FieldDefinitionUpdateInput = Partial<Omit<FieldDefinitionInput, "key">>;

export interface PortalForm {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  target_type: TaskTargetType | string;
  sections: SectionConfig[];
  settings: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
}
export interface PortalFormInput {
  name: string;
  description?: string | null;
  target_type?: TaskTargetType | string;
  sections?: SectionConfig[];
  settings?: Record<string, unknown>;
}
export type PortalFormUpdateInput = Partial<PortalFormInput> & { status?: string };

/** A wiki-style reference page in the speaker portal (docx: "Resource and wiki
 * pages within the speaker portal, including HTML embed support"). */
export interface PortalResource {
  id: string;
  event_id: string;
  title: string;
  body_html: string;
  status: "draft" | "published";
  sort_order: number;
  created_at: string;
  updated_at: string;
}
export interface PortalResourceInput {
  title: string;
  body_html?: string;
  status?: "draft" | "published";
  sort_order?: number;
}
export type PortalResourceUpdateInput = Partial<PortalResourceInput>;

export interface FileRequest {
  id: string;
  event_id: string;
  title: string;
  instructions_html: string | null;
  target_type: TaskTargetType | string;
  due_at: string | null;
  session_id: string | null;
  session_title: string | null;
  assigned_person_ids: string[];
  accepted_extensions: string[];
  max_size_mb: number;
  uploads?: { id: string; file_id: string; person_id: string; uploaded_at: string }[];
  deliverables: Array<{
    person_id: string;
    person_name: string | null;
    person_email: string | null;
    status: "uploaded" | "outstanding";
    overdue: boolean;
    file_id: string | null;
    filename: string | null;
    file_type: string | null;
    uploaded_at: string | null;
    version: number | null;
  }>;
  created_at: string;
  updated_at: string;
}
export interface FileRequestInput {
  title: string;
  instructions_html?: string | null;
  target_type?: TaskTargetType | string;
  due_at?: string | null;
  session_id?: string | null;
  assigned_person_ids?: string[];
  accepted_extensions?: string[];
  max_size_mb?: number;
}
export type FileRequestUpdateInput = Partial<FileRequestInput>;

/** Audit entry written when a speaker edits a submission after acceptance. */
export interface SubmissionEvent {
  id: string;
  submission_id: string;
  actor_user_id: string | null;
  actor_person_id: string | null;
  action: string;
  changed_fields: string[];
  created_at: string;
}

export interface SessionImportPreviewRow {
  row: number;
  values: Record<string, string>;
  errors: string[];
}
export interface SessionImportPreview {
  columns: string[];
  mapping: Record<string, string>;
  rows: SessionImportPreviewRow[];
}


// ---------------------------------------------------------------------------
// Public widgets (unauthenticated program surfaces)
// ---------------------------------------------------------------------------

export interface PublicSpeaker {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  company: string | null;
  bio: string | null;
  headshot_file_id: string | null;
  website: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  role?: string;
}

export interface PublicSpeakerWithSessions extends PublicSpeaker {
  sessions: {
    id: string;
    title: string;
    starts_at: string | null;
    ends_at: string | null;
    room: { id: string; name: string } | null;
    track: { id: string; name: string; color: string | null } | null;
  }[];
}

export interface PublicSession {
  id: string;
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  room: { id: string; name: string } | null;
  location: string | null;
  track: { id: string; name: string; color: string | null } | null;
  format: { id: string; name: string } | null;
  language: string | null;
  speakers: PublicSpeaker[];
}

/** One payload behind all five widgets, so no two surfaces can disagree. */
export interface PublicProgram {
  event: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    location: string | null;
    timezone: string;
    starts_at: string | null;
    ends_at: string | null;
    agenda_published_at: string | null;
  };
  sessions: PublicSession[];
  speakers: PublicSpeakerWithSessions[];
  tracks: { id: string; name: string; color: string | null }[];
  formats: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
}
