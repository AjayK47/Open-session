import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ChevronsUpDown, Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@opensession/ui";
import type { OrgSummary } from "@opensession/schemas";
import { organizationApi } from "../api";
import { ORGANIZATION_CONTEXT_KEY } from "../lib/organization";

/**
 * Same shape as EventSwitcher, one level up: switches which organization is
 * active rather than which event. Single-org deployments never see more
 * than one entry in `organizations`, so this renders nothing there — no
 * separate mode flag needed, it just reacts to what the API reports.
 */
export function OrganizationSwitcher({
  currentOrganizationId,
  currentOrganizationName,
  organizations,
  isLoading,
}: {
  currentOrganizationId?: string;
  currentOrganizationName?: string;
  organizations: OrgSummary[];
  isLoading?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setActive = useMutation({
    mutationFn: (organizationId: string) => organizationApi.setActive(organizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORGANIZATION_CONTEXT_KEY });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["crm"] });
      navigate("/app/events");
    },
  });

  if (organizations.length <= 1) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={currentOrganizationName || "Select organization"}
          className="flex min-w-0 flex-1 items-center justify-between gap-1 rounded-md px-1.5 py-1 text-left outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 hover:bg-secondary transition-colors"
        >
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {isLoading ? "Loading..." : currentOrganizationName || "Select organization"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onSelect={() => setActive.mutate(org.id)}
            className={org.id === currentOrganizationId ? "bg-accent text-accent-foreground" : undefined}
          >
            {org.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/onboarding")}>
          <Plus className="h-4 w-4" />
          Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
