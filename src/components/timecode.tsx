import { formatTimecode } from "@/lib/timecode";

/**
 * The product's signature: every timestamp is a mono timecode with a small
 * amber capture tick in front of it, like an edge code on film.
 */
export function Timecode({
  seconds,
  className = "",
}: {
  seconds: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-mono text-xs tabular-nums ${className}`}
    >
      <span aria-hidden="true" className="h-3 w-px bg-accent" />
      {formatTimecode(seconds)}
    </span>
  );
}
