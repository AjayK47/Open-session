import { Plus, Trash2 } from "lucide-react";
import type { ParticipantInput } from "@opensession/schemas";
import { Button, Input } from "@opensession/ui";

const EMPTY: ParticipantInput = { email: "", role: "speaker", first_name: "", last_name: "" };

/**
 * Add/edit/remove participants by email (plan §9.4 "Add co-speaker by email").
 * Used in the public CFP participants step, manual abstract drawer, and session drawer.
 */
export function ParticipantListEditor({
  value,
  onChange,
  roles,
}: {
  value: ParticipantInput[];
  onChange: (next: ParticipantInput[]) => void;
  roles?: string[];
}) {
  function update(index: number, patch: Partial<ParticipantInput>) {
    onChange(value.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }
  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...value, { ...EMPTY, role: roles?.[0] ?? "speaker" }]);
  }

  return (
    <div className="space-y-3">
      {value.map((participant, index) => (
        <div key={index} className="rounded-lg border border-border p-3">
          <div className="flex items-start gap-2">
            <div className="grid flex-1 grid-cols-2 gap-2">
              <Input
                placeholder="Email"
                type="email"
                value={participant.email}
                onChange={(e) => update(index, { email: e.target.value })}
                className="col-span-2"
              />
              <Input
                placeholder="First name"
                value={participant.first_name ?? ""}
                onChange={(e) => update(index, { first_name: e.target.value })}
              />
              <Input
                placeholder="Last name"
                value={participant.last_name ?? ""}
                onChange={(e) => update(index, { last_name: e.target.value })}
              />
              {roles && roles.length > 1 ? (
                <select
                  className="col-span-2 h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={participant.role}
                  onChange={(e) => update(index, { role: e.target.value })}
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} aria-label="Remove participant">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4" />
        Add participant
      </Button>
    </div>
  );
}
