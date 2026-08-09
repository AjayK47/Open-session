import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

/**
 * Rounded-square icon holder used beside panel titles and in list rows.
 *
 * `tone` tints the chip to carry meaning (a green chip on "Accepted", amber on
 * "Pending") without coloring the label text itself — text stays in ink tokens
 * so identity never depends on color alone.
 */
const iconChipVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-lg border [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "border-border bg-secondary text-muted-foreground",
        brand: "border-primary/25 bg-primary/12 text-primary",
        success: "border-success/25 bg-success/12 text-success",
        warning: "border-warning/25 bg-warning/12 text-warning",
        danger: "border-destructive/25 bg-destructive/12 text-destructive",
      },
      size: {
        sm: "size-7 [&_svg]:size-3.5",
        default: "size-9 [&_svg]:size-4",
        lg: "size-11 [&_svg]:size-5",
      },
    },
    defaultVariants: { tone: "neutral", size: "default" },
  },
);

export interface IconChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof iconChipVariants> {}

export function IconChip({ className, tone, size, ...props }: IconChipProps) {
  return <span className={cn(iconChipVariants({ tone, size }), className)} {...props} />;
}

export { iconChipVariants };
