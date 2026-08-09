import { Plus, Trash2 } from "lucide-react";
import type {
  ConditionalRuleConfig,
  RoutingRuleConfig,
  ConditionOperator,
  ConditionalActionKind,
  RoutingActionKind,
} from "@opensession/schemas";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@opensession/ui";

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "contains", label: "contains" },
  { value: "any_of", label: "is any of" },
  { value: "is_set", label: "is set" },
  { value: "is_not_set", label: "is not set" },
];

export interface FieldOption {
  key: string;
  label: string;
}

/**
 * Conditional field rules — "IF Format = Workshop THEN show Workshop Duration"
 * (product plan §8.2 step 5). Shares the condition-row shape with RoutingRuleEditor.
 */
export function ConditionalRuleEditor({
  rules,
  onChange,
  fieldOptions,
}: {
  rules: ConditionalRuleConfig[];
  onChange: (rules: ConditionalRuleConfig[]) => void;
  fieldOptions: FieldOption[];
}) {
  function updateRule(index: number, patch: Partial<ConditionalRuleConfig>) {
    onChange(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function removeRule(index: number) {
    onChange(rules.filter((_, i) => i !== index));
  }
  function addRule() {
    onChange([
      ...rules,
      { field: fieldOptions[0]?.key ?? "", operator: "equals", value: "", actions: [{ kind: "show", target: fieldOptions[0]?.key ?? "" }] },
    ]);
  }

  return (
    <div className="space-y-3">
      {rules.map((rule, index) => (
        <div key={index} className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-muted-foreground">IF</span>
            <FieldSelect value={rule.field} options={fieldOptions} onChange={(v) => updateRule(index, { field: v })} />
            <OperatorSelect value={rule.operator as ConditionOperator} onChange={(v) => updateRule(index, { operator: v })} />
            {rule.operator !== "is_set" && rule.operator !== "is_not_set" && (
              <Input
                className="h-8 w-40"
                value={String(rule.value ?? "")}
                onChange={(e) => updateRule(index, { value: e.target.value })}
                placeholder="value"
              />
            )}
            <Button type="button" variant="ghost" size="icon" className="ml-auto" onClick={() => removeRule(index)}>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
          <div className="space-y-1.5 pl-6">
            {(rule.actions ?? []).map((action, actionIndex) => (
              <div key={actionIndex} className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">THEN</span>
                <Select
                  value={action.kind}
                  onValueChange={(v) => {
                    const actions = [...(rule.actions ?? [])];
                    actions[actionIndex] = { ...action, kind: v as ConditionalActionKind };
                    updateRule(index, { actions });
                  }}
                >
                  <SelectTrigger className="h-8 w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="show">show</SelectItem>
                    <SelectItem value="hide">hide</SelectItem>
                    <SelectItem value="require">require</SelectItem>
                  </SelectContent>
                </Select>
                <FieldSelect
                  value={action.target}
                  options={fieldOptions}
                  onChange={(v) => {
                    const actions = [...(rule.actions ?? [])];
                    actions[actionIndex] = { ...action, target: v };
                    updateRule(index, { actions });
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => updateRule(index, { actions: (rule.actions ?? []).filter((_, i) => i !== actionIndex) })}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                updateRule(index, { actions: [...(rule.actions ?? []), { kind: "show", target: fieldOptions[0]?.key ?? "" }] })
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add action
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRule}>
        <Plus className="h-4 w-4" />
        Add conditional rule
      </Button>
    </div>
  );
}

/**
 * Category routing rules — "IF Track = AI Agents THEN assign Evaluation Plan =
 * AI Committee" (product plan §8.2 step 5).
 */
export function RoutingRuleEditor({
  rules,
  onChange,
  fieldOptions,
  trackOptions,
  tagOptions,
  planOptions,
}: {
  rules: RoutingRuleConfig[];
  onChange: (rules: RoutingRuleConfig[]) => void;
  fieldOptions: FieldOption[];
  trackOptions: FieldOption[];
  tagOptions: FieldOption[];
  planOptions: FieldOption[];
}) {
  function updateRule(index: number, patch: Partial<RoutingRuleConfig>) {
    onChange(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function removeRule(index: number) {
    onChange(rules.filter((_, i) => i !== index));
  }
  function addRule() {
    onChange([...rules, { trigger: { field: fieldOptions[0]?.key ?? "", operator: "equals", value: "" }, actions: [] }]);
  }

  function actionValueOptions(kind: RoutingActionKind): FieldOption[] {
    if (kind === "assign_track") return trackOptions;
    if (kind === "add_tag") return tagOptions;
    if (kind === "assign_evaluation_plan") return planOptions;
    return [];
  }

  return (
    <div className="space-y-3">
      {rules.map((rule, index) => (
        <div key={index} className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-muted-foreground">IF</span>
            <FieldSelect value={rule.trigger.field} options={fieldOptions} onChange={(v) => updateRule(index, { trigger: { ...rule.trigger, field: v } })} />
            <OperatorSelect value={rule.trigger.operator as ConditionOperator} onChange={(v) => updateRule(index, { trigger: { ...rule.trigger, operator: v } })} />
            <Input
              className="h-8 w-40"
              value={String(rule.trigger.value ?? "")}
              onChange={(e) => updateRule(index, { trigger: { ...rule.trigger, value: e.target.value } })}
              placeholder="value"
            />
            <Button type="button" variant="ghost" size="icon" className="ml-auto" onClick={() => removeRule(index)}>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
          <div className="space-y-1.5 pl-6">
            {(rule.actions ?? []).map((action, actionIndex) => (
              <div key={actionIndex} className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">THEN</span>
                <Select
                  value={action.kind}
                  onValueChange={(v) => {
                    const actions = [...(rule.actions ?? [])];
                    actions[actionIndex] = { kind: v as RoutingActionKind, value: "" };
                    updateRule(index, { actions });
                  }}
                >
                  <SelectTrigger className="h-8 w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assign_track">assign track</SelectItem>
                    <SelectItem value="add_tag">add tag</SelectItem>
                    <SelectItem value="assign_evaluation_plan">assign evaluation plan</SelectItem>
                    <SelectItem value="assign_owner">assign owner (email)</SelectItem>
                  </SelectContent>
                </Select>
                {action.kind === "assign_owner" ? (
                  <Input
                    className="h-8 w-48"
                    value={String(action.value ?? "")}
                    placeholder="owner@example.com"
                    onChange={(e) => {
                      const actions = [...(rule.actions ?? [])];
                      actions[actionIndex] = { ...action, value: e.target.value };
                      updateRule(index, { actions });
                    }}
                  />
                ) : (
                  <FieldSelect
                    value={String(action.value ?? "")}
                    options={actionValueOptions(action.kind as RoutingActionKind)}
                    onChange={(v) => {
                      const actions = [...(rule.actions ?? [])];
                      actions[actionIndex] = { ...action, value: v };
                      updateRule(index, { actions });
                    }}
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => updateRule(index, { actions: (rule.actions ?? []).filter((_, i) => i !== actionIndex) })}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => updateRule(index, { actions: [...(rule.actions ?? []), { kind: "assign_track", value: "" }] })}
            >
              <Plus className="h-3.5 w-3.5" />
              Add action
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRule}>
        <Plus className="h-4 w-4" />
        Add routing rule
      </Button>
    </div>
  );
}

function FieldSelect({ value, options, onChange }: { value: string; options: FieldOption[]; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.key} value={opt.key}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function OperatorSelect({ value, onChange }: { value: ConditionOperator; onChange: (v: ConditionOperator) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ConditionOperator)}>
      <SelectTrigger className="h-8 w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPERATORS.map((op) => (
          <SelectItem key={op.value} value={op.value}>
            {op.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
