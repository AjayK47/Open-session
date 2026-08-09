import type { ReactNode } from "react";
import { Button, Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetDescription } from "@opensession/ui";

/** The right-side "quick create/edit" drawer shell (product plan §1.4). */
export function DrawerForm({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  submitLabel = "Save",
  onSubmit,
  isSubmitting,
  widthClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  submitLabel?: string;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  widthClassName?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent widthClassName={widthClassName}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <SheetBody>{children}</SheetBody>
        <SheetFooter>
          {footer ?? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} type="button">
                Cancel
              </Button>
              {onSubmit && (
                <Button onClick={onSubmit} disabled={isSubmitting} type="button">
                  {isSubmitting ? "Saving..." : submitLabel}
                </Button>
              )}
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
