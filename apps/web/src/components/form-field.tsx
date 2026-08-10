import { useRef } from "react";
import { CalendarDays, Info, X } from "lucide-react";
import { Input, Label, cn } from "@opensession/ui";

/** Shared label+hint wrapper used across event forms (Create event, Event
 * Settings) so field styling stays consistent between them. */
export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label>
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
        {hint && (
          <span title={hint}>
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  return <p className="text-xs text-destructive">{message}</p>;
}

/** Datetime field with an inline clear (×) button, matching Sessionboard's
 * "October 12th, 2026 at 9:00 AM PDT  ×" date-picker style. */
export function ClearableDateTime({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    const input = inputRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "pr-10 [&::-webkit-calendar-picker-indicator]:opacity-0",
          value && "pr-[4.5rem]",
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear date and time"
          className="absolute right-10 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={openPicker}
        aria-label="Open date and time picker"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-foreground/75 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
    </div>
  );
}
