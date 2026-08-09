import { Info, X } from "lucide-react";
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
  return (
    <div className="relative">
      <Input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} className={cn(value && "pr-8")} />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
