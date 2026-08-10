import { useQuery } from "@tanstack/react-query";
import { organizationApi } from "../api";

export const ORGANIZATION_CONTEXT_KEY = ["organization", "context"] as const;

export function useOrganizationContext() {
  return useQuery({
    queryKey: ORGANIZATION_CONTEXT_KEY,
    queryFn: organizationApi.context,
    staleTime: 30_000,
  });
}
