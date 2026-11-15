import { Timecode } from "@/components/timecode";
import { Timeline } from "@/components/timeline";
import { formatTimecode } from "@/lib/timecode";

const PREVIEW_SLOTS = 8;

type CapturePlanProps = {
  interval: number;
  start?: number;
  end?: number;
  format: "jpg" | "png";
  quality: string;
  contactSheet: boolean;
};

/**
 * Shown before a job starts: where frames will land for the current settings,
 * laid out like the contact sheet they will become.
 */
export function CapturePlan({
  interval,
  start,
  end,
  format,
  quality,
  contactSheet,
}: CapturePlanProps) {
  const from = start ?? 0;
  const isValid =
    Number.isInteger(interval) &&
    interval > 0 &&
    Number.isInteger(from) &&
    from >= 0 &&
    (end === undefined || (Number.isInteger(end) && end > from));

  const total =
    isValid && end !== undefined
      ? Math.floor((end - from) / interval) + 1
      : undefined;
  const slotCount = total ? Math.min(total, PREVIEW_SLOTS) : PREVIEW_SLOTS;
  const overflow = total && total > PREVIEW_SLOTS ? total - (PREVIEW_SLOTS - 1) : 0;

  const every = interval === 1 ? "second" : `${interval} seconds`;
  const until = end !== undefined ? formatTimecode(end) : "the end of the video";

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium text-fg-secondary">Capture plan</h2>
        <span className="font-mono text-xs text-fg-muted">
          {format.toUpperCase()} · {quality}
        </span>
      </div>

      <p className="mt-2 text-lg leading-7 text-pretty text-fg">
        {isValid
          ? `A frame every ${every}, from ${formatTimecode(from)} to ${until}`
          : "Enter a whole-second interval, and a start before the end, to see where frames land"}
      </p>

      {isValid ? (
        <>
          <div className="mt-5">
            <Timeline start={from} end={end} interval={interval} />
          </div>

          <ol className="mt-4 grid grid-cols-4 gap-x-2 gap-y-3 sm:gap-x-3">
            {Array.from({ length: slotCount }, (_, index) => {
              const isOverflowSlot = overflow > 0 && index === slotCount - 1;
              const seconds = isOverflowSlot
                ? from + (total! - 1) * interval
                : from + index * interval;

              return (
                <li key={index} className="flex flex-col gap-1.5">
                  <div className="flex aspect-video items-center justify-center rounded-lg border border-line bg-frame">
                    {isOverflowSlot ? (
                      <span className="font-mono text-xs text-fg-muted">
                        +{overflow} more
                      </span>
                    ) : null}
                  </div>
                  <Timecode seconds={seconds} className="text-fg-secondary" />
                </li>
              );
            })}
          </ol>
        </>
      ) : null}

      <div className="mt-auto pt-5">
        <p className="border-t border-line pt-3 text-[13px] leading-5 text-fg-muted">
          {total ? `${total} frames, plus` : "Plus"} a PDF with every frame
          {contactSheet ? " and a contact sheet" : ""}
        </p>
      </div>
    </div>
  );
}
