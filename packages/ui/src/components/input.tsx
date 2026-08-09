import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Field surface shared by Input, Textarea, and SelectTrigger so a row of mixed
 * controls lines up exactly — same height, radius, border, and focus ring.
 */
export const fieldBase = [
  "w-full rounded-md border border-input bg-card text-foreground shadow-xs",
  "placeholder:text-muted-foreground/70",
  "transition-[border-color,box-shadow] duration-150",
  "outline-none focus:outline-none focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40",
  "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
].join(" ");

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        fieldBase,
        "h-9 px-3 py-1 text-sm",
        // Date/time inputs render a native picker glyph that ignores currentColor
        // in light-on-dark; nudge it to match the field's own ink.
        "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-55",
        "[&::-webkit-calendar-picker-indicator]:hover:opacity-100",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(fieldBase, "min-h-20 resize-y px-3 py-2 text-sm leading-relaxed", className)}
      ref={ref}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
