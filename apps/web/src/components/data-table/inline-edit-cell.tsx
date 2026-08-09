import { useState, type ReactNode } from "react";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@opensession/ui";
import { Check, X } from "lucide-react";

interface InlineEditCellProps {
  value: string;
  type: "select" | "text";
  options?: { value: string; label: string }[];
  onSave: (newValue: string) => Promise<void>;
  renderValue?: (value: string) => ReactNode;
  /** Announced to screen readers on the trigger, e.g. "Edit status". */
  label?: string;
}

/**
 * Edit one field without leaving the table.
 *
 * Every event here stops propagation: these cells live in rows that carry an
 * `onRowClick` navigation handler, so without it the first click on the pill
 * routes to the detail page and the popover never gets to open.
 */
export function InlineEditCell({ value, type, options, onSave, renderValue, label }: InlineEditCellProps) {
  const [open, setOpen] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editValue);
      setOpen(false);
    } finally {
      // The caller owns error reporting (it has the toast + the query cache);
      // this only has to make sure the popover never stays stuck in "saving".
      setIsSaving(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setEditValue(value);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          className="-ml-1 cursor-pointer rounded border border-transparent px-1 py-0.5 text-left transition-colors hover:border-border hover:bg-muted/50"
        >
          {renderValue ? renderValue(value) : value || <span className="italic text-muted-foreground">Empty</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          {type === "text" ? (
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              disabled={isSaving}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSave();
              }}
            />
          ) : (
            <Select value={editValue} onValueChange={setEditValue} disabled={isSaving}>
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {options?.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
              <X />
              Cancel
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={isSaving || editValue === value}>
              <Check />
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
