export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

/** Horizontal bar list — magnitude comparison across a handful of categories. */
export function BarChart({ data }: { data: BarDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3 text-xs">
          <span className="w-28 shrink-0 truncate text-muted-foreground">{d.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color ?? "var(--primary)" }}
            />
          </div>
          <span className="w-6 shrink-0 text-right tabular-nums text-foreground">{d.value}</span>
        </div>
      ))}
    </div>
  );
}
