import type { FieldConfig, SectionConfig, ConditionalRuleConfig } from "@opensession/schemas";
import { Input, Label, Checkbox, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@opensession/ui";
import { RichTextEditor } from "../../components/rich-text-editor";
import { TrackMultiSelect } from "../../components/track-tag-picker";
import { evaluateVisibility, requiredFields } from "../../lib/conditional-rules";

export interface DynamicFormOptions {
  tracks: { id: string; name: string }[];
  formats: { id: string; name: string }[];
  tags: { id: string; name: string }[];
}

const LEVELS = ["Beginner", "Intermediate", "Advanced"];

/**
 * Renders a form schema (sections/fields) for both the CFP builder's live preview
 * and the actual public submission flow — one renderer, two contexts, so they never
 * drift (frontend plan §7.5).
 */
export function DynamicForm({
  sections,
  rules,
  answers,
  onChange,
  options,
  disabled,
  errors,
}: {
  sections: SectionConfig[];
  rules: ConditionalRuleConfig[];
  answers: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  options: DynamicFormOptions;
  disabled?: boolean;
  /** Field key → message, shown beneath the control. */
  errors?: Record<string, string>;
}) {
  const visibility = evaluateVisibility(answers, rules);
  const forceRequired = requiredFields(answers, rules);

  return (
    <div className="space-y-8">
      {sections.map((section) => {
        const visibleFields = (section.fields ?? []).filter((f) => visibility[f.key] !== false);
        if (visibleFields.length === 0) return null;
        return (
          <div key={section.key} className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">{section.title}</h3>
              {section.instructions ? <p className="text-sm text-muted-foreground">{section.instructions}</p> : null}
            </div>
            <div className="space-y-4">
              {visibleFields.map((field) => (
                <div key={field.key} id={`field-${field.key}`} data-invalid={errors?.[field.key] ? "true" : undefined}>
                  <FieldControl
                    field={field}
                    required={Boolean(field.required) || forceRequired.has(field.key)}
                    value={answers[field.key]}
                    onChange={(v) => onChange(field.key, v)}
                    options={options}
                    disabled={disabled}
                  />
                  {errors?.[field.key] && (
                    <p role="alert" className="mt-1.5 text-xs text-destructive">
                      {errors[field.key]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FieldControl({
  field,
  required,
  value,
  onChange,
  options,
  disabled,
}: {
  field: FieldConfig;
  required: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
  options: DynamicFormOptions;
  disabled?: boolean;
}) {
  const label = (
    <Label className="mb-1.5 block">
      {field.label}
      {required ? <span className="ml-0.5 text-destructive">*</span> : null}
    </Label>
  );
  const help = field.help_text ? <p className="mt-1 text-xs text-muted-foreground">{field.help_text}</p> : null;

  const type = field.system_field ?? field.field_type;

  if (type === "description") {
    return (
      <div>
        {label}
        <RichTextEditor value={String(value ?? "")} onChange={onChange} />
        {help}
      </div>
    );
  }
  if (type === "format") {
    return (
      <div>
        {label}
        <SelectField value={String(value ?? "")} onChange={onChange} disabled={disabled} placeholder={field.placeholder ?? "Select a format"} items={options.formats.map((f) => ({ value: f.id, label: f.name }))} />
        {help}
      </div>
    );
  }
  if (type === "track") {
    // A talk can go to more than one track (swyx Q&A #2). Stored as an array;
    // the first entry becomes the primary track server-side.
    const selected = Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [];
    return (
      <div>
        {label}
        <TrackMultiSelect
          tracks={options.tracks}
          value={selected}
          onChange={(next) => onChange(next)}
          disabled={disabled}
        />
        {help}
      </div>
    );
  }
  if (type === "tags") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div>
        {label}
        <div className="flex flex-wrap gap-2">
          {options.tags.map((tag) => {
            const active = selected.includes(tag.id);
            return (
              <button
                type="button"
                key={tag.id}
                disabled={disabled}
                onClick={() => onChange(active ? selected.filter((id) => id !== tag.id) : [...selected, tag.id])}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${active ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground"}`}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
        {help}
      </div>
    );
  }
  if (type === "level") {
    return (
      <div>
        {label}
        <SelectField value={String(value ?? "")} onChange={onChange} disabled={disabled} placeholder="Select a level" items={LEVELS.map((l) => ({ value: l, label: l }))} />
        {help}
      </div>
    );
  }
  if (type === "language") {
    return null; // defaults to English and is typically hidden per plan §8.2
  }

  switch (field.field_type) {
    case "system":
    case "short_text":
    case "url":
    case "email":
      return (
        <div>
          {label}
          <Input
            type={field.field_type === "email" ? "email" : field.field_type === "url" ? "url" : "text"}
            value={String(value ?? "")}
            placeholder={field.placeholder ?? ""}
            maxLength={field.max_length ?? undefined}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
          {help}
        </div>
      );
    case "long_text":
      return (
        <div>
          {label}
          <RichTextEditor value={String(value ?? "")} onChange={onChange} />
          {help}
        </div>
      );
    case "number":
      return (
        <div>
          {label}
          <Input type="number" value={String(value ?? "")} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
          {help}
        </div>
      );
    case "date":
      return (
        <div>
          {label}
          <Input type="date" value={String(value ?? "")} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
          {help}
        </div>
      );
    case "dropdown":
    case "radio":
      return (
        <div>
          {label}
          <SelectField
            value={String(value ?? "")}
            onChange={onChange}
            disabled={disabled}
            placeholder={field.placeholder ?? "Select..."}
            items={(field.options ?? []).map((o) => ({ value: o, label: o }))}
          />
          {help}
        </div>
      );
    case "multi_select":
    case "checkbox": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div>
          {label}
          <div className="space-y-1.5">
            {(field.options ?? []).map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <Checkbox
                  disabled={disabled}
                  checked={selected.includes(option)}
                  onCheckedChange={(v) => onChange(v ? [...selected, option] : selected.filter((o) => o !== option))}
                />
                {option}
              </label>
            ))}
          </div>
          {help}
        </div>
      );
    }
    case "file":
      return (
        <div>
          {label}
          <p className="text-xs text-muted-foreground">File upload fields are collected after acceptance via speaker tasks.</p>
        </div>
      );
    default:
      return (
        <div>
          {label}
          <Input value={String(value ?? "")} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
          {help}
        </div>
      );
  }
}

function SelectField({
  value,
  onChange,
  items,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
