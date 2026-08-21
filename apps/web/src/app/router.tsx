import { lazy, Suspense, type PropsWithChildren } from "react";
import { Routes, Route, Navigate } from "react-router";
import { RequireAuth, useAuth } from "../lib/auth";
import { useOrganizationContext } from "../lib/organization";
import { OrganizerShell } from "../layouts/organizer-shell";
import { PortalShell } from "../layouts/portal-shell";
import { ReviewShell } from "../layouts/review-shell";
import { PublicShell } from "../layouts/public-shell";

const LoginPage = lazy(() => import("../features/auth/LoginPage").then(m => ({ default: m.LoginPage })));
const LandingPage = lazy(() => import("../features/marketing/LandingPage").then(m => ({ default: m.LandingPage })));
const OrganizationOnboardingPage = lazy(() => import("../features/organization/OrganizationOnboardingPage").then(m => ({ default: m.OrganizationOnboardingPage })));
const OrganizationSettingsPage = lazy(() => import("../features/organization/OrganizationSettingsPage").then(m => ({ default: m.OrganizationSettingsPage })));
const InvitationAcceptPage = lazy(() => import("../features/organization/InvitationAcceptPage").then(m => ({ default: m.InvitationAcceptPage })));
const CrmDirectoryPage = lazy(() => import("../features/crm/CrmDirectoryPage").then(m => ({ default: m.CrmDirectoryPage })));
const CrmContactPage = lazy(() => import("../features/crm/CrmContactPage").then(m => ({ default: m.CrmContactPage })));
const EventListPage = lazy(() => import("../features/events/EventListPage").then(m => ({ default: m.EventListPage })));
const CreateEventPage = lazy(() => import("../features/events/CreateEventPage").then(m => ({ default: m.CreateEventPage })));
const OverviewPage = lazy(() => import("../features/overview/OverviewPage").then(m => ({ default: m.OverviewPage })));
const DashboardPage = lazy(() => import("../features/dashboard/DashboardPage").then(m => ({ default: m.DashboardPage })));
const ProgramSetupPage = lazy(() => import("../features/settings/ProgramSetupPage").then(m => ({ default: m.ProgramSetupPage })));
const EventSettingsPage = lazy(() => import("../features/settings/EventSettingsPage").then(m => ({ default: m.EventSettingsPage })));
const TeamSettingsPage = lazy(() => import("../features/settings/TeamSettingsPage").then(m => ({ default: m.TeamSettingsPage })));
const ApiKeysPage = lazy(() => import("../features/settings/ApiKeysPage").then(m => ({ default: m.ApiKeysPage })));

const PortalFormsPage = lazy(() => import("../features/portal-forms/PortalFormsPage").then(m => ({ default: m.PortalFormsPage })));
const FormsListPage = lazy(() => import("../features/forms/FormsListPage").then(m => ({ default: m.FormsListPage })));
const FormBuilderPage = lazy(() => import("../features/forms/FormBuilderPage").then(m => ({ default: m.FormBuilderPage })));
const PublicCfpPage = lazy(() => import("../features/forms/PublicCfpPage").then(m => ({ default: m.PublicCfpPage })));

const SubmissionsListPage = lazy(() => import("../features/submissions/SubmissionsListPage").then(m => ({ default: m.SubmissionsListPage })));
const SubmissionDetailPage = lazy(() => import("../features/submissions/SubmissionDetailPage").then(m => ({ default: m.SubmissionDetailPage })));

const EvaluationsListPage = lazy(() => import("../features/evaluations/EvaluationsListPage").then(m => ({ default: m.EvaluationsListPage })));
const EvaluationPlanPage = lazy(() => import("../features/evaluations/EvaluationPlanPage").then(m => ({ default: m.EvaluationPlanPage })));
const ReviewerAssignmentsPage = lazy(() => import("../features/evaluations/ReviewerAssignmentsPage").then(m => ({ default: m.ReviewerAssignmentsPage })));
const ReviewerSubmissionPage = lazy(() => import("../features/evaluations/ReviewerSubmissionPage").then(m => ({ default: m.ReviewerSubmissionPage })));

const SpeakersListPage = lazy(() => import("../features/speakers/SpeakersListPage").then(m => ({ default: m.SpeakersListPage })));
const SpeakerDetailPage = lazy(() => import("../features/speakers/SpeakerDetailPage").then(m => ({ default: m.SpeakerDetailPage })));

const SessionsListPage = lazy(() => import("../features/sessions/SessionsListPage").then(m => ({ default: m.SessionsListPage })));
const AgendaPage = lazy(() => import("../features/agenda/AgendaPage").then(m => ({ default: m.AgendaPage })));

const TasksPage = lazy(() => import("../features/tasks/TasksPage").then(m => ({ default: m.TasksPage })));
const FilesPage = lazy(() => import("../features/files/FilesPage").then(m => ({ default: m.FilesPage })));

const TemplatesPage = lazy(() => import("../features/communications/TemplatesPage").then(m => ({ default: m.TemplatesPage })));
const AutomationsPage = lazy(() => import("../features/communications/AutomationsPage").then(m => ({ default: m.AutomationsPage })));
const CommunicationsHistoryPage = lazy(() => import("../features/communications/CommunicationsHistoryPage").then(m => ({ default: m.CommunicationsHistoryPage })));

const SessionsListWidget = lazy(() => import("../features/widgets/SessionsListWidget").then(m => ({ default: m.SessionsListWidget })));
const SpeakersListWidget = lazy(() => import("../features/widgets/SpeakersWidgets").then(m => ({ default: m.SpeakersListWidget })));
const SpeakerGalleryWidget = lazy(() => import("../features/widgets/SpeakersWidgets").then(m => ({ default: m.SpeakerGalleryWidget })));
const AgendaWidget = lazy(() => import("../features/widgets/AgendaWidget").then(m => ({ default: m.AgendaWidget })));
const ItineraryWidget = lazy(() => import("../features/widgets/ItineraryWidget").then(m => ({ default: m.ItineraryWidget })));
const EmbedPage = lazy(() => import("../features/widgets/EmbedPage").then(m => ({ default: m.EmbedPage })));
const PublicSurfaceEntry = lazy(() => import("../features/widgets/PublicEntry").then(m => ({ default: m.PublicSurfaceEntry })));
const PublicLandingPage = lazy(() => import("../features/widgets/PublicEntry").then(m => ({ default: m.PublicLandingPage })));

const PortalHomePage = lazy(() => import("../features/portal/PortalHomePage").then(m => ({ default: m.PortalHomePage })));
const PortalSubmissionsPage = lazy(() => import("../features/portal/PortalSubmissionsPage").then(m => ({ default: m.PortalSubmissionsPage })));
const PortalProfilePage = lazy(() => import("../features/portal/PortalProfilePage").then(m => ({ default: m.PortalProfilePage })));
const PortalTasksPage = lazy(() => import("../features/portal/PortalTasksPage").then(m => ({ default: m.PortalTasksPage })));
const PortalFilesPage = lazy(() => import("../features/portal/PortalFilesPage").then(m => ({ default: m.PortalFilesPage })));
const PortalResourcesPage = lazy(() => import("../features/portal/PortalResourcesPage").then(m => ({ default: m.PortalResourcesPage })));
const ResourcesPage = lazy(() => import("../features/resources/ResourcesPage").then(m => ({ default: m.ResourcesPage })));
const PortalCalendarPage = lazy(() => import("../features/portal/PortalCalendarPage").then(m => ({ default: m.PortalCalendarPage })));
const SessionDetailPage = lazy(() => import("../features/sessions/SessionDetailPage").then(m => ({ default: m.SessionDetailPage })));

function PageLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

/**
 * The root path serves whoever asks for it: staff go to their events, everyone
 * else gets the public programme instead of a login wall they can't pass.
 */
function RootEntry() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  return user ? <AuthenticatedRoot /> : <LandingPage />;
}

function AuthenticatedRoot() {
  const { data, isLoading } = useOrganizationContext();
  if (isLoading) return <PageLoader />;
  return <Navigate to={data?.needs_onboarding ? "/onboarding" : "/app/events"} replace />;
}

/**
 * Guards the organizer app (/app/*) on organization state, not just auth.
 * Previously only the root path (/) checked needs_onboarding, so a signed-in
 * org-less user deep-linking straight to e.g. /app/events bypassed onboarding
 * entirely. Nest inside RequireAuth — this assumes a user is already known.
 */
function RequireOrganization({ children }: PropsWithChildren) {
  const { data, isLoading } = useOrganizationContext();
  if (isLoading) return <PageLoader />;
  if (data?.needs_onboarding) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<RootEntry />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/onboarding" element={<RequireAuth redirectTo="/login"><OrganizationOnboardingPage /></RequireAuth>} />
        <Route path="/invitations/accept" element={<RequireAuth redirectTo="/login"><InvitationAcceptPage /></RequireAuth>} />
        <Route
          path="/app/organization"
          element={
            <RequireAuth redirectTo="/login">
              <RequireOrganization>
                <OrganizationSettingsPage />
              </RequireOrganization>
            </RequireAuth>
          }
        />

        {/* Speaker CRM (CRM-01) — org-level, deliberately outside the
            /app/events/:eventId nesting: a contact here spans every event. */}
        <Route
          path="/app/crm"
          element={
            <RequireAuth redirectTo="/login">
              <RequireOrganization>
                <CrmDirectoryPage />
              </RequireOrganization>
            </RequireAuth>
          }
        />
        <Route
          path="/app/crm/:personId"
          element={
            <RequireAuth redirectTo="/login">
              <RequireOrganization>
                <CrmContactPage />
              </RequireOrganization>
            </RequireAuth>
          }
        />

        {/* Organizer app */}
        <Route
          path="/app/events"
          element={
            <RequireAuth redirectTo="/login">
              <RequireOrganization>
                <EventListPage />
              </RequireOrganization>
            </RequireAuth>
          }
        />
        <Route
          path="/app/events/new"
          element={
            <RequireAuth redirectTo="/login">
              <RequireOrganization>
                <CreateEventPage />
              </RequireOrganization>
            </RequireAuth>
          }
        />
        <Route
          path="/app/events/:eventId"
          element={
            <RequireAuth redirectTo="/login">
              <RequireOrganization>
                <OrganizerShell />
              </RequireOrganization>
            </RequireAuth>
          }
        >
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="overview" element={<OverviewPage />} />

          <Route path="submissions" element={<SubmissionsListPage />} />
          <Route path="submissions/:submissionId" element={<SubmissionDetailPage />} />

          <Route path="sessions" element={<SessionsListPage />} />
          <Route path="sessions/:sessionId" element={<SessionDetailPage />} />

          <Route path="speakers" element={<SpeakersListPage />} />
          <Route path="speakers/:speakerId" element={<SpeakerDetailPage />} />

          <Route path="evaluations" element={<EvaluationsListPage />} />
          <Route path="evaluations/new" element={<EvaluationPlanPage />} />
          <Route path="evaluations/:planId" element={<EvaluationPlanPage />} />

          <Route path="agenda" element={<AgendaPage />} />
          <Route path="embed" element={<EmbedPage />} />

          <Route path="tasks" element={<TasksPage />} />
          <Route path="files" element={<FilesPage />} />
          <Route path="resources" element={<ResourcesPage />} />

          <Route path="communications/templates" element={<TemplatesPage />} />
          <Route path="communications/automations" element={<AutomationsPage />} />
          <Route path="communications/history" element={<CommunicationsHistoryPage />} />

          <Route path="forms" element={<FormsListPage />} />
          <Route path="portal-forms" element={<PortalFormsPage />} />
          <Route path="forms/new" element={<FormBuilderPage />} />
          <Route path="forms/:formId/edit" element={<FormBuilderPage />} />

          <Route path="settings" element={<Navigate to="event" replace />} />
          <Route path="settings/event" element={<EventSettingsPage />} />
          <Route path="settings/program" element={<ProgramSetupPage />} />
          <Route path="settings/team" element={<TeamSettingsPage />} />
          <Route path="settings/api" element={<ApiKeysPage />} />
        </Route>

        {/* Slugless aliases. An attendee coming from a poster or a search result
            types the obvious path; these resolve it to the published event. */}
        <Route path="/sessions" element={<PublicSurfaceEntry surface="sessions" />} />
        <Route path="/program" element={<PublicSurfaceEntry surface="sessions" />} />
        <Route path="/speakers" element={<PublicSurfaceEntry surface="speakers" />} />
        <Route path="/agenda" element={<PublicSurfaceEntry surface="agenda" />} />
        <Route path="/schedule" element={<PublicSurfaceEntry surface="agenda" />} />
        <Route path="/itinerary" element={<PublicSurfaceEntry surface="itinerary" />} />
        <Route path="/gallery" element={<PublicSurfaceEntry surface="gallery" />} />
        <Route path="/public" element={<PublicLandingPage />} />

        {/* Public attendee widgets — deliberately outside RequireAuth: these must
            all be readable logged out, and embeddable in a third-party iframe. */}
        <Route path="/e/:eventSlug">
          <Route index element={<SessionsListWidget />} />
          <Route path="sessions" element={<SessionsListWidget />} />
          <Route path="speakers" element={<SpeakersListWidget />} />
          <Route path="agenda" element={<AgendaWidget />} />
          <Route path="itinerary" element={<ItineraryWidget />} />
          <Route path="gallery" element={<SpeakerGalleryWidget />} />
        </Route>

        {/* Public CFP */}
        <Route path="/submit/:eventSlug/:formSlug" element={<PublicShell />}>
          <Route index element={<PublicCfpPage />} />
        </Route>

        {/* Speaker portal */}
        <Route
          path="/portal/:eventSlug"
          element={
            <RequireAuth redirectTo="/login">
              <PortalShell />
            </RequireAuth>
          }
        >
          <Route index element={<PortalHomePage />} />
          <Route path="submissions" element={<PortalSubmissionsPage />} />
          <Route path="submissions/:submissionId" element={<PortalSubmissionsPage />} />
          <Route path="profile" element={<PortalProfilePage />} />
          <Route path="tasks" element={<PortalTasksPage />} />
          <Route path="tasks/:assignmentId" element={<PortalTasksPage />} />
          <Route path="files" element={<PortalFilesPage />} />
          <Route path="resources" element={<PortalResourcesPage />} />
          <Route path="calendar" element={<PortalCalendarPage />} />
        </Route>

        {/* Reviewer portal */}
        <Route
          path="/review/:eventSlug"
          element={
            <RequireAuth redirectTo="/login">
              <ReviewShell />
            </RequireAuth>
          }
        >
          <Route index element={<ReviewerAssignmentsPage />} />
          <Route path="assignments" element={<ReviewerAssignmentsPage />} />
          <Route path="submissions/:submissionId" element={<ReviewerSubmissionPage />} />
        </Route>

        {/* Unknown paths land on the root, which decides per visitor — bouncing
            an anonymous visitor to the organizer app just shows them a login. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
