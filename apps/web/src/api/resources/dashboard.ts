import type { EventMetrics, OnboardingDashboard } from "@opensession/schemas";
import { http } from "../client";

export const dashboardApi = {
  metrics: (eventId: string) => http.get<EventMetrics>(`/api/v1/events/${eventId}/metrics`),
  onboarding: (eventId: string) => http.get<OnboardingDashboard>(`/api/v1/events/${eventId}/onboarding`),
};
