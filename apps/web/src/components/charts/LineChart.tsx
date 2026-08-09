import { useId, useState } from "react";

export interface LineChartPoint {
  label: string;
  value: number;
}

/**
 * Minimal single-series line chart (product plan's "Submission Pacing" panel).
 * Thin 2px line, rounded cap, a filled dot + crosshair on hover, recessive
 * gridlines — per the dataviz skill's mark spec, no chart library needed for one series.
 */
export function LineChart({ data, height = 220 }: { data: LineChartPoint[]; height?: number }) {
  const clipId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = 600;
  const padding = { top: 16, right: 16, bottom: 28, left: 32 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const maxValue = Math.max(1, ...data.map((d) => d.value));
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  function x(i: number) {
    return padding.left + i * stepX;
  }
  function y(v: number) {
    return padding.top + innerH - (v / maxValue) * innerH;
  }

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d.value)}`).join(" ");
  const areaPath = `${linePath} L ${x(data.length - 1)} ${padding.top + innerH} L ${x(0)} ${padding.top + innerH} Z`;

  const yTicks = 4;
  const gridLines = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = (maxValue / yTicks) * i;
    return { v: Math.round(v), y: y(v) };
  });

  const hovered = hoverIndex !== null ? data[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * width;
          const i = Math.round((relX - padding.left) / (stepX || 1));
          setHoverIndex(Math.min(data.length - 1, Math.max(0, i)));
        }}
      >
        <defs>
          <linearGradient id={clipId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={padding.left} x2={width - padding.right} y1={g.y} y2={g.y} stroke="var(--border)" strokeWidth={1} />
            <text x={padding.left - 8} y={g.y} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[10px]">
              {g.v}
            </text>
          </g>
        ))}

        <path d={areaPath} fill={`url(#${clipId})`} />
        <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {data.map((d, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(d.value)}
            r={hoverIndex === i ? 4 : 0}
            fill="var(--primary)"
            stroke="var(--card)"
            strokeWidth={2}
          />
        ))}

        {hoverIndex !== null && <line x1={x(hoverIndex)} x2={x(hoverIndex)} y1={padding.top} y2={padding.top + innerH} stroke="var(--border)" strokeWidth={1} strokeDasharray="3 3" />}

        {data.map((d, i) =>
          i % Math.ceil(data.length / 6 || 1) === 0 ? (
            <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {d.label}
            </text>
          ) : null,
        )}
      </svg>
      {hovered && hoverIndex !== null && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-md"
          style={{ left: `${(x(hoverIndex) / width) * 100}%` }}
        >
          <p className="font-medium text-foreground">{hovered.value}</p>
          <p className="text-muted-foreground">{hovered.label}</p>
        </div>
      )}
    </div>
  );
}
