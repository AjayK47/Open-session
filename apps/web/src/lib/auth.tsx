import { createContext, useContext, type PropsWithChildren } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router";
import type { AuthUser } from "@opensession/schemas";
import { ApiError, authApi } from "../api";

const AUTH_QUERY_KEY = ["auth", "me"] as const;

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  refetch: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: authApi.me,
    retry: false,
    staleTime: 60_000,
    // A 401 here just means "not logged in" — treat it as data, not an error banner.
    throwOnError: (error) => !(error instanceof ApiError && error.status === 401),
  });

  async function logout() {
    await authApi.logout();
    queryClient.setQueryData(AUTH_QUERY_KEY, null);
    queryClient.clear();
  }

  return (
    <AuthContext.Provider value={{ user: data ?? null, isLoading, refetch: () => refetch(), logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function invalidateAuth(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
}

/** Guards organizer/reviewer/speaker routes that require a signed-in user. */
export function RequireAuth({ children, redirectTo }: PropsWithChildren<{ redirectTo: string }>) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return null;
  if (!user) {
    return <Navigate to={`${redirectTo}?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}
