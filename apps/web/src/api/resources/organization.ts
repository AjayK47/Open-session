import type {
  Organization,
  OrganizationContext,
  OrganizationInput,
  OrganizationInvitation,
  OrganizationMember,
} from "@opensession/schemas";
import { apiUrl, http } from "../client";

export const organizationApi = {
  context: () => http.get<OrganizationContext>("/api/v1/organization/context"),
  get: () => http.get<Organization>("/api/v1/organization"),
  create: (input: OrganizationInput) => http.post<Organization>("/api/v1/organization", input),
  update: (input: Partial<OrganizationInput>) => http.patch<Organization>("/api/v1/organization", input),
  members: () => http.get<OrganizationMember[]>("/api/v1/organization/members"),
  removeMember: (userId: string) => http.delete<void>(`/api/v1/organization/members/${userId}`),
  invitations: () => http.get<OrganizationInvitation[]>("/api/v1/organization/invitations"),
  invite: (email: string, role: "admin" | "member") =>
    http.post<OrganizationInvitation>("/api/v1/organization/invitations", { email, role }),
  resend: (invitationId: string) =>
    http.post<OrganizationInvitation>(`/api/v1/organization/invitations/${invitationId}/resend`),
  revoke: (invitationId: string) =>
    http.post<void>(`/api/v1/organization/invitations/${invitationId}/revoke`),
  accept: (token: string) =>
    http.post<{ organization: Organization; membership_role: string }>(
      `/api/v1/organization/invitations/accept?token=${encodeURIComponent(token)}`,
    ),
  uploadLogo: async (file: File) => {
    const response = await fetch(apiUrl("/api/v1/organization/logo"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": file.type, "X-Filename": file.name },
      body: file,
    });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "Logo upload failed");
  },
};
