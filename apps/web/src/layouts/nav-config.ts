import {
  FileStack,
  LayoutGrid,
  FileText,
  CalendarDays,
  Users,
  ClipboardCheck,
  Mail,
  History,
  ListChecks,
  FolderOpen,
  BookOpen,
  Settings,
  SlidersHorizontal,
  UsersRound,
  KeyRound,
  Share2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  to: (eventId: string) => string;
  icon: LucideIcon;
}
export interface NavGroup {
  title?: string;
  items: NavItem[];
}

/** Final IA — Dashboard is its own top-level page (the rich, chart-driven pulse of
 * the event); Program's Overview is the lighter per-event summary underneath it. */
export const NAV_GROUPS: NavGroup[] = [
  { items: [{ label: "Dashboard", to: (id) => `/app/events/${id}/dashboard`, icon: LayoutGrid }] },
  {
    title: "Program",
    items: [
      { label: "Overview", to: (id) => `/app/events/${id}/overview`, icon: LayoutGrid },
      { label: "Submissions", to: (id) => `/app/events/${id}/submissions`, icon: FileText },
      { label: "Sessions", to: (id) => `/app/events/${id}/sessions`, icon: ListChecks },
      { label: "Speakers", to: (id) => `/app/events/${id}/speakers`, icon: Users },
      { label: "Evaluations", to: (id) => `/app/events/${id}/evaluations`, icon: ClipboardCheck },
      { label: "Agenda", to: (id) => `/app/events/${id}/agenda`, icon: CalendarDays },
      { label: "Embed & Share", to: (id) => `/app/events/${id}/embed`, icon: Share2 },
    ],
  },
  {
    title: "Speaker Operations",
    items: [
      { label: "Tasks", to: (id) => `/app/events/${id}/tasks`, icon: ListChecks },
      { label: "Files", to: (id) => `/app/events/${id}/files`, icon: FolderOpen },
      { label: "Resources", to: (id) => `/app/events/${id}/resources`, icon: BookOpen },
    ],
  },
  {
    title: "Communications",
    items: [
      { label: "Templates & Automations", to: (id) => `/app/events/${id}/communications/templates`, icon: Mail },
      { label: "History", to: (id) => `/app/events/${id}/communications/history`, icon: History },
    ],
  },
  {
    title: "Configure",
    items: [
      { label: "Submission Forms", to: (id) => `/app/events/${id}/forms`, icon: FileText },
      { label: "Portal Forms & File Requests", to: (id) => `/app/events/${id}/portal-forms`, icon: FileStack },
      { label: "Event Settings", to: (id) => `/app/events/${id}/settings/event`, icon: Settings },
      { label: "Program Setup", to: (id) => `/app/events/${id}/settings/program`, icon: SlidersHorizontal },
      { label: "Team", to: (id) => `/app/events/${id}/settings/team`, icon: UsersRound },
      { label: "API", to: (id) => `/app/events/${id}/settings/api`, icon: KeyRound },
    ],
  },
];
