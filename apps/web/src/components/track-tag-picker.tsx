import { cn } from "@opensession/ui";

/** Deterministic 8-color categorical palette for tracks (frontend plan §2). */
const TRACK_COLORS = [
  "track-1",
  "track-2",
  "track-3",
  "track-4",
  "track-5",
  "track-6",
  "track-7",
  "track-8",
] as const;

function hashToIndex(id: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % length;
}

/**
 * Resolves to the raw `--track-N` token, not the Tailwind `--color-track-N`
 * alias: `@theme inline` inlines colors into utilities and does not emit the
 * `--color-*` custom properties to :root, so reading them from JS yields "".
 */
export function trackColorVar(trackId: string): string {
  return `var(--${TRACK_COLORS[hashToIndex(trackId, TRACK_COLORS.length)]})`;
}

/** A track/tag pill using the deterministic per-id color. */
export function TrackPill({ id, name, className }: { id: string; name: string; className?: string }) {
  const color = trackColorVar(id);
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", className)}
      style={{ backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}

export function TagPill({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground", className)}>
      {name}
    </span>
  );
}

/**
 * Multi-select for tracks — a talk can be submitted to more than one.
 *
 * Order matters: the first selected track is the *primary* one the backend
 * stores on `track_id`, so the list is kept in click order rather than sorted.
 */
export function TrackMultiSelect({
  tracks,
  value,
  onChange,
  disabled,
}: {
  tracks: { id: string; name: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  if (tracks.length === 0) {
    return <p className="text-xs text-muted-foreground">No tracks configured yet.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {tracks.map((track) => {
        const index = value.indexOf(track.id);
        const selected = index >= 0;
        const color = trackColorVar(track.id);
        return (
          <button
            key={track.id}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onChange(selected ? value.filter((id) => id !== track.id) : [...value, track.id])}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              selected ? "border-transparent" : "border-border text-muted-foreground hover:text-foreground",
              disabled && "cursor-not-allowed opacity-60",
            )}
            style={
              selected
                ? { backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`, color }
                : undefined
            }
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: selected ? color : "var(--muted-foreground)" }}
            />
            {track.name}
            {index === 0 && <span className="ml-0.5 opacity-70">· primary</span>}
          </button>
        );
      })}
    </div>
  );
}
