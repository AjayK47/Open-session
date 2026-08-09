import { Outlet, useParams, Link } from "react-router";
import { LogOut } from "lucide-react";
import { Button } from "@opensession/ui";
import { useAuth } from "../lib/auth";

/** Minimal reviewer shell (frontend plan §12 decision) — no shared sidebar, less chrome. */
export function ReviewShell() {
  const { eventSlug } = useParams<{ eventSlug: string }>();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to={`/review/${eventSlug}`} className="text-sm font-semibold">
            Review
          </Link>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
