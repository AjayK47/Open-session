export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/** Donut with a center total + a labeled legend list (never color-alone identity). */
export function DonutChart({ slices, centerLabel, size = 160 }: { slices: DonutSlice[]; centerLabel?: string; size?: number }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const radius = size / 2;
  const strokeWidth = size * 0.16;
  const innerRadius = radius - strokeWidth / 2;
  const circumference = 2 * Math.PI * innerRadius;

  let offset = 0;
  const segments = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const fraction = total > 0 ? s.value / total : 0;
      const dash = fraction * circumference;
      const gap = circumference - dash;
      const seg = { ...s, dash, gap, offset };
      offset += dash;
      return seg;
    });

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
        <circle cx={radius} cy={radius} r={innerRadius} fill="none" stroke="var(--muted)" strokeWidth={strokeWidth} />
        {segments.map((s, i) => (
          <circle
            key={i}
            cx={radius}
            cy={radius}
            r={innerRadius}
            fill="none"
            stroke={s.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={-s.offset}
            strokeLinecap={segments.length > 1 ? "butt" : "round"}
          />
        ))}
        {total === 0 && <circle cx={radius} cy={radius} r={innerRadius} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} strokeDasharray="4 4" />}
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5">
        {centerLabel && <p className="text-xs text-muted-foreground">{centerLabel}</p>}
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="flex-1 truncate text-foreground">{s.label}</span>
            <span className="tabular-nums text-muted-foreground">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
