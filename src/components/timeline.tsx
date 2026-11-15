import { formatTimecode } from "@/lib/timecode";

const MAX_TICKS = 120;
const OPEN_ENDED_STEPS = 12;

type TimelineProps = {
  /** First capture, in seconds. */
  start: number;
  /** Last possible capture, if known. */
  end?: number;
  interval: number;
  /** Full video length. When known, the strip spans the whole video. */
  duration?: number;
};

/**
 * A ruler with one amber tick per captured frame. Before the video length is
 * known it shows the requested range, or the first few ticks fading out.
 */
export function Timeline({ start, end, interval, duration }: TimelineProps) {
  let windowStart = start;
  let windowEnd: number;
  let openEnded = false;

  if (duration) {
    windowStart = 0;
    windowEnd = duration;
  } else if (end !== undefined) {
    windowEnd = end;
  } else {
    windowEnd = start + interval * OPEN_ENDED_STEPS;
    openEnded = true;
  }

  const captureEnd = Math.min(end ?? windowEnd, windowEnd);
  const count = Math.max(1, Math.floor((captureEnd - start) / interval) + 1);
  const step = Math.ceil(count / MAX_TICKS);
  const span = windowEnd - windowStart || 1;
  const position = (seconds: number) =>
    Math.min(100, Math.max(0, ((seconds - windowStart) / span) * 100));

  const ticks: number[] = [];
  for (let index = 0; index < count; index += step) {
    ticks.push(start + index * interval);
  }

  const label = openEnded
    ? `A frame every ${interval} seconds from ${formatTimecode(start)} to the end of the video`
    : `${count} frames from ${formatTimecode(start)} to ${formatTimecode(captureEnd)}`;

  return (
    <div role="img" aria-label={label}>
      <div
        className="relative h-4"
        style={
          openEnded
            ? {
                maskImage: "linear-gradient(to right, #000 65%, transparent)",
                WebkitMaskImage:
                  "linear-gradient(to right, #000 65%, transparent)",
              }
            : undefined
        }
      >
        <div className="absolute inset-x-0 bottom-0 h-px bg-line-strong" />
        {duration ? (
          <div
            className="absolute bottom-0 h-1 rounded-full bg-accent-soft"
            style={{
              left: `${position(start)}%`,
              width: `${position(captureEnd) - position(start)}%`,
            }}
          />
        ) : null}
        {/* Inset half a pixel each side so the first and last ticks stay
            inside the strip; crispEdges keeps every tick on a whole pixel. */}
        <svg
          aria-hidden="true"
          className="absolute inset-y-0 h-full overflow-visible"
          style={{ left: 0.5, right: 0.5, width: "calc(100% - 1px)" }}
        >
          {ticks.map((seconds) => {
            const x = `${position(seconds)}%`;
            return (
              <line
                key={seconds}
                x1={x}
                x2={x}
                y1="4"
                y2="16"
                stroke="var(--accent)"
                strokeWidth="1"
                shapeRendering="crispEdges"
              />
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex justify-between font-mono text-xs tabular-nums text-fg-muted">
        <span>{formatTimecode(windowStart)}</span>
        <span>{openEnded ? "…" : formatTimecode(windowEnd)}</span>
      </div>
    </div>
  );
}
