import type { ConditionalRuleConfig, SectionConfig } from "@opensession/schemas";

/**
 * Client-side mirror of app/rules/engine.py's evaluate_condition/evaluate_conditional_rules/
 * required_fields. Used to show/hide/require fields instantly as the submitter types
 * (product plan §9.3 "Conditional logic is evaluated instantly client-side"). The
 * server re-validates independently on submit — this is UX only, never trusted.
 */

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

export function evaluateCondition(field: string, operator: string, value: unknown, answers: Record<string, unknown>): boolean {
  const answer = answers[field];
  switch (operator) {
    case "is_set":
      return !isEmpty(answer);
    case "is_not_set":
      return isEmpty(answer);
    case "equals":
      return answer === value;
    case "not_equals":
      return answer !== value;
    case "contains":
      if (Array.isArray(answer)) return answer.includes(value);
      return String(answer ?? "").includes(String(value ?? ""));
    case "any_of": {
      const wanted = Array.isArray(value) ? value : [value];
      const have = Array.isArray(answer) ? answer : [answer];
      return wanted.some((w) => have.includes(w));
    }
    default:
      return false;
  }
}

export function evaluateVisibility(answers: Record<string, unknown>, rules: ConditionalRuleConfig[]): Record<string, boolean> {
  const visibility: Record<string, boolean> = {};
  for (const rule of rules) {
    if (!evaluateCondition(rule.field, rule.operator, rule.value, answers)) continue;
    for (const action of rule.actions ?? []) {
      if (action.kind === "show") visibility[action.target] = true;
      else if (action.kind === "hide") visibility[action.target] = false;
    }
  }
  return visibility;
}

export function requiredFields(answers: Record<string, unknown>, rules: ConditionalRuleConfig[]): Set<string> {
  const required = new Set<string>();
  for (const rule of rules) {
    if (!evaluateCondition(rule.field, rule.operator, rule.value, answers)) continue;
    for (const action of rule.actions ?? []) {
      if (action.kind === "require") required.add(action.target);
    }
  }
  return required;
}

/**
 * Which visible, required fields on a set of sections are still empty.
 *
 * Mirrors `submission_service.validate_submission`'s required-field pass so the
 * wizard can stop a speaker at the step that has the problem, instead of letting
 * them walk to the end and getting the whole list back from the server. The
 * server still re-validates — this never decides whether a submission is valid,
 * only whether it is worth advancing a step.
 */
export function missingRequiredFields(
  sections: SectionConfig[],
  rules: ConditionalRuleConfig[],
  answers: Record<string, unknown>,
): Record<string, string> {
  const visibility = evaluateVisibility(answers, rules);
  const forced = requiredFields(answers, rules);
  const errors: Record<string, string> = {};

  for (const section of sections) {
    for (const field of section.fields ?? []) {
      if (visibility[field.key] === false) continue;
      // `language` is rendered as null by DynamicForm (defaults to English), so
      // requiring it would block on a control the speaker can never see.
      if (field.system_field === "language") continue;
      const required = Boolean(field.required) || forced.has(field.key);
      if (required && isEmpty(answers[field.key])) {
        errors[field.key] = `${field.label} is required.`;
      }
    }
  }
  return errors;
}
