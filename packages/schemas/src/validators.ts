import { z } from "zod";

/** Zod schemas for the forms actually filled out via React Hook Form. */

export const trackSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  description: z.string().max(2000).optional().or(z.literal("")),
  color: z.string().optional().or(z.literal("")),
  serial_schedule: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const roomSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  location: z.string().max(200).optional().or(z.literal("")),
  capacity: z.coerce.number().int().nonnegative().optional().nullable(),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export const formatSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  default_duration_minutes: z.coerce.number().int().positive().optional().nullable(),
});

export const tagSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
});

export const eventBasicsSchema = z.object({
  name: z.string().min(1, "Event name is required").max(200),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  type: z.string().min(1),
  website_url: z.string().url().optional().or(z.literal("")),
  location: z.string().max(200).optional().or(z.literal("")),
  timezone: z.string().min(1, "Timezone is required"),
  starts_at: z.string().min(1, "Start date is required"),
  ends_at: z.string().min(1, "End date is required"),
  description: z.string().max(4000).optional().or(z.literal("")),
});

export const eventEmailIdentitySchema = z.object({
  email_sender_name: z.string().max(120).optional().or(z.literal("")),
  email_sender_address: z.string().email().optional().or(z.literal("")),
  reply_to: z.string().email().optional().or(z.literal("")),
});

export const participantInputSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.string().min(1),
  first_name: z.string().max(120).optional().or(z.literal("")),
  last_name: z.string().max(120).optional().or(z.literal("")),
  company: z.string().max(200).optional().or(z.literal("")),
  job_title: z.string().max(200).optional().or(z.literal("")),
  bio: z.string().max(5000).optional().or(z.literal("")),
});

export const manualSubmissionSchema = z.object({
  form_id: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().max(20000).optional().or(z.literal("")),
  track_id: z.string().optional().nullable(),
  track_ids: z.array(z.string()).optional().nullable(),
  format_id: z.string().optional().nullable(),
  level: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  // Numeric fields arrive from number inputs as strings; coerce and treat "" as unset.
  capacity: z.coerce.number().int().nonnegative().optional().nullable(),
  ceu_credits: z.coerce.number().nonnegative().optional().nullable(),
  client_session_id: z.string().max(128).optional().or(z.literal("")),
  language: z.string().max(64).optional().or(z.literal("")),
  starts_at: z.string().optional().or(z.literal("")),
  ends_at: z.string().optional().or(z.literal("")),
  participants: z.array(participantInputSchema).optional(),
});

export const taskTemplateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  instructions: z.string().max(5000).optional().or(z.literal("")),
  task_type: z.enum(["confirmation", "profile", "file_upload", "form", "custom"]),
  target_type: z.enum(["contact", "group", "submission"]).optional(),
  portal_form_id: z.string().optional().nullable(),
  required: z.boolean().optional(),
  due_rule: z
    .object({
      offset_days: z.coerce.number().int().optional(),
    })
    .partial()
    .optional(),
});

export const criterionSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/, "lowercase, numbers, underscore only"),
  label: z.string().min(1, "Label is required").max(120),
  description: z.string().max(1000).optional().or(z.literal("")),
  type: z.enum(["numeric", "dropdown", "yes_no", "text"]),
  options: z.array(z.string().min(1)).optional(),
  scale_max: z.coerce.number().int().min(2).max(10).optional(),
  weight: z.coerce.number().min(0).max(10).optional(),
  required: z.boolean().optional(),
});

export const evaluationPlanSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  instructions: z.string().max(5000).optional().or(z.literal("")),
  scope: z
    .object({
      form_id: z.string().optional().nullable(),
      track_ids: z.array(z.string()).optional(),
    })
    .optional(),
  criteria: z.array(criterionSchema).min(1, "Add at least one criterion"),
  reviews_required: z.coerce.number().int().min(1).max(10).optional(),
  blind_review: z.boolean().optional(),
});

export const emailTemplateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  subject_template: z.string().min(1, "Subject is required").max(500),
  html_template: z.string().min(1, "Body is required"),
  text_template: z.string().optional().or(z.literal("")),
});

export const automationSchema = z.object({
  trigger_type: z.string().min(1, "Trigger is required"),
  template_id: z.string().min(1, "Template is required"),
  include_calendar_invite: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const profileSchema = z.object({
  first_name: z.string().max(120).optional().or(z.literal("")),
  last_name: z.string().max(120).optional().or(z.literal("")),
  bio: z.string().max(5000).optional().or(z.literal("")),
  company: z.string().max(200).optional().or(z.literal("")),
  job_title: z.string().max(200).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  website: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  linkedin_url: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  x_url: z.string().url("Enter a valid URL").optional().or(z.literal("")),
});

export const fieldConfigSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/, "lowercase, numbers, underscore only"),
  label: z.string().min(1, "Label is required").max(200),
  field_type: z.string().min(1),
  system_field: z.string().optional().nullable(),
  help_text: z.string().max(1000).optional().or(z.literal("")),
  required: z.boolean().optional(),
  placeholder: z.string().max(200).optional().or(z.literal("")),
  options: z.array(z.string()).optional(),
  min_length: z.coerce.number().int().optional().nullable(),
  max_length: z.coerce.number().int().optional().nullable(),
});

export const memberSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(["owner", "admin", "reviewer", "speaker"]),
});

export const apiKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  scopes: z.array(z.string()).min(1, "Select at least one scope"),
  expires_at: z.string().optional().nullable(),
});

export const requestCodeSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

export const organizationSchema = z.object({
  name: z.string().trim().min(2, "Organization name is required").max(200),
  slug: z
    .string()
    .trim()
    .min(2, "Workspace URL is required")
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens"),
  website_url: z.string().url("Enter a valid website URL").optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  default_timezone: z.string().min(1, "Timezone is required"),
});

export const organizationInviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(["admin", "member"]),
});
export const verifyCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().min(4, "Enter the code we emailed you"),
  // Collected on the public CFP so a first-time speaker arrives with a name
  // rather than just an email address. Ignored for returning speakers.
  first_name: z.string().max(120).optional(),
  last_name: z.string().max(120).optional(),
});
