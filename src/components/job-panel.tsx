import {
  Check,
  Circle,
  CircleAlert,
  Download,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import type { JobPublic, JobStage } from "@/types/jobs";
import { JobLog } from "@/components/job-log";
import { Timeline } from "@/components/timeline";
import { formatTimecode } from "@/lib/timecode";

const STEPS: { stage: JobStage; label: string }[] = [
  { stage: "validating", label: "Check yt-dlp and ffmpeg" },
  { stage: "fetching_metadata", label: "Read video info" },
  { stage: "downloading", label: "Download video" },
  { stage: "extracting", label: "Extract frames" },
  { stage: "creating_pdf", label: "Build the PDF" },
];

const STAGE_LABELS: Record<JobStage, string> = {
  queued: "Waiting for a free worker",
  validating: "Checking yt-dlp and ffmpeg",
  fetching_metadata: "Reading video info",
  downloading: "Downloading video",
  extracting: "Extracting frames",
  creating_pdf: "Building the PDF",
  done: "Done",
  failed: "Failed",
};

const ICON = { size: 16, strokeWidth: 1.5, "aria-hidden": true } as const;

function VideoHeader({ job }: { job: JobPublic }) {
  const { metadata, request } = job;
  const facts = [
    metadata?.duration ? formatTimecode(metadata.duration) : null,
    request.quality ?? "1080p",
    request.format.toUpperCase(),
  ].filter(Boolean);

  return (
    <div className="flex gap-4">
      <div className="aspect-video w-28 shrink-0 overflow-hidden rounded-md border border-line bg-frame">
        {metadata?.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail, no optimizer needed
          <img
            src={metadata.thumbnail}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : null}
      </div>
      <div className="min-w-0 py-0.5">
        {metadata?.title ? (
          <p className="line-clamp-2 text-[15px] leading-6 font-medium text-fg">
            {metadata.title}
          </p>
        ) : (
          <p className="truncate font-mono text-xs leading-6 text-fg-muted">
            {request.url}
          </p>
        )}
        <p className="mt-1 font-mono text-xs tabular-nums text-fg-muted">
          {facts.join(" · ")}
        </p>
      </div>
    </div>
  );
}

function Steps({ stage }: { stage: JobStage }) {
  const activeIndex = STEPS.findIndex((step) => step.stage === stage);

  return (
    <ol className="flex flex-col">
      {STEPS.map((step, index) => {
        const state =
          activeIndex === -1 || index > activeIndex
            ? "pending"
            : index < activeIndex
              ? "done"
              : "active";

        return (
          <li key={step.stage} className="flex h-8 items-center gap-2.5 text-sm">
            <span className="flex w-4 justify-center">
              {state === "done" ? (
                <Check {...ICON} className="text-fg-muted" />
              ) : state === "active" ? (
                <LoaderCircle {...ICON} className="animate-spin text-accent" />
              ) : (
                <Circle {...ICON} className="text-line-strong" />
              )}
            </span>
            <span
              className={
                state === "active"
                  ? "font-medium text-fg"
                  : state === "done"
                    ? "text-fg-secondary"
                    : "text-fg-muted"
              }
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Live status for a job: progress while it runs, the result once it's done. */
export function JobPanel({ job }: { job: JobPublic }) {
  const isDone = job.status === "done";
  const isFailed = job.status === "failed";
  const isRunning = !isDone && !isFailed;
  const output = job.output;
  const duration = job.metadata?.duration;
  const start = job.request.start ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <VideoHeader job={job} />

      {isFailed ? (
        <div role="alert" className="rounded-lg bg-danger-soft px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-danger">
            <CircleAlert {...ICON} />
            Extraction failed
          </p>
          <p className="mt-1 pl-6 text-sm leading-6 wrap-break-word text-fg-secondary">
            {job.error ?? "Something went wrong. The log below has details."}
          </p>
        </div>
      ) : (
        <div aria-live="polite">
          <div className="flex items-center justify-between gap-4">
            <p className="flex items-center gap-2 text-sm font-medium text-fg">
              {isDone ? <Check {...ICON} className="text-accent" /> : null}
              {isDone && output
                ? `${output.imageCount} ${output.imageCount === 1 ? "frame" : "frames"} ready`
                : STAGE_LABELS[job.stage]}
            </p>
            {isRunning ? (
              <span className="font-mono text-xs tabular-nums text-fg-muted">
                {job.progress}%
              </span>
            ) : null}
          </div>
          {isRunning ? (
            <div
              role="progressbar"
              aria-label="Progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={job.progress}
              className="mt-3 h-1 overflow-hidden rounded-full bg-raised"
            >
              <div
                className="h-full origin-left bg-accent transition-transform duration-500 ease-out"
                style={{ transform: `scaleX(${job.progress / 100})` }}
              />
            </div>
          ) : null}
        </div>
      )}

      {isRunning ? <Steps stage={job.stage} /> : null}

      {duration && !isFailed ? (
        <Timeline
          start={Math.min(start, duration)}
          end={Math.min(job.request.end ?? duration, duration)}
          interval={job.request.interval}
          duration={duration}
        />
      ) : null}

      {job.warnings?.length ? (
        <ul className="flex flex-col gap-2">
          {job.warnings.map((warning) => (
            <li
              key={warning}
              className="flex gap-2 text-sm leading-6 text-fg-secondary"
            >
              <TriangleAlert {...ICON} className="mt-1 shrink-0 text-accent" />
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      {output?.pdfUrl ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={output.pdfUrl}
            download={output.pdfFilename}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-fg px-4 text-sm font-medium text-bg transition-[background-color,transform] duration-150 ease-out hover:bg-fg/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
          >
            <Download {...ICON} />
            Download PDF
          </a>
          <span className="max-w-full min-w-0 truncate font-mono text-xs text-fg-muted">
            {output.pdfFilename}
          </span>
        </div>
      ) : null}

      <JobLog
        key={isFailed ? "failed" : "live"}
        logs={job.logs ?? []}
        defaultOpen={isFailed}
      />
    </div>
  );
}
