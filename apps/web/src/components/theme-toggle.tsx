import { Moon, Sun } from "lucide-react";
import { Button, cn } from "@opensession/ui";
import { useTheme } from "../lib/theme";

/** Ghost icon button, styled to sit in any app header. For the marketing
 *  landing page's own bespoke chrome, see ThemeToggleBare below instead. */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, toggle] = useTheme();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={className}
      onClick={toggle}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
    >
      {theme === "light" ? <Moon /> : <Sun />}
    </Button>
  );
}

/** Unstyled variant (no @opensession/ui Button) for pages with their own
 *  bespoke chrome — pass the classes that make it read as "one of these
 *  controls" on that page. */
export function ThemeToggleBare({ className }: { className?: string }) {
  const [theme, toggle] = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      className={cn("inline-flex items-center justify-center", className)}
    >
      {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </button>
  );
}
