"use client";

import { useEffect, useMemo, useState } from "react";
import type { JobPublic } from "@/types/jobs";

const stageLabels: Record<string, string> = {
  queued: "Queued",
  validating: "Validating input",
  fetching_metadata: "Fetching metadata",
  downloading: "Fetching video",
  extracting: "Extracting frames",
  zipping: "Packaging files",
  done: "Done",
  failed: "Failed",
};

function formatDuration(totalSeconds?: number) {
  if (!totalSeconds || totalSeconds <= 0) {
    return "Unknown";
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const paddedMinutes = String(minutes).padStart(hours ? 2 : 1, "0");
  const paddedSeconds = String(seconds).padStart(2, "0");
  return hours
    ? `${hours}:${paddedMinutes}:${paddedSeconds}`
    : `${paddedMinutes}:${paddedSeconds}`;
}

function formatTimestamp(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatLogTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString();
}

const logLevelStyles: Record<string, string> = {
  info: "bg-slate-800 text-slate-200",
  warn: "bg-amber-500/20 text-amber-200",
  error: "bg-rose-500/20 text-rose-200",
  debug: "bg-sky-500/20 text-sky-200",
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [interval, setInterval] = useState("10");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [format, setFormat] = useState<"jpg" | "png">("jpg");
  const [contactSheet, setContactSheet] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [job, setJob] = useState<JobPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isWorking = job && job.status !== "done" && job.status !== "failed";
  const stageLabel = job ? stageLabels[job.stage] ?? "Processing" : "";
  const snapshots = job?.output?.snapshots ?? [];
  const contactSheetFile = job?.output?.contactSheet;
  const logs = job?.logs ?? [];

  useEffect(() => {
    if (!job || job.status === "done" || job.status === "failed") {
      return undefined;
    }

    const timer = setInterval(async () => {
      const response = await fetch(`/api/jobs/${job.id}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { job: JobPublic };
      setJob(payload.job);
    }, 1500);

    return () => clearInterval(timer);
  }, [job?.id, job?.status]);

  const submitLabel = useMemo(() => {
    if (isSubmitting) {
      return "Starting...";
    }
    if (isWorking) {
      return "Processing...";
    }
    return "Extract snapshots";
  }, [isSubmitting, isWorking]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError("Please enter a YouTube URL.");
      return;
    }

    const intervalValue = Number(interval);
    if (!Number.isFinite(intervalValue) || intervalValue <= 0) {
      setError("Interval must be a positive number.");
      return;
    }
    if (!Number.isInteger(intervalValue)) {
      setError("Interval must be a whole number of seconds.");
      return;
    }

    const startValue = start ? Number(start) : undefined;
    const endValue = end ? Number(end) : undefined;
    if (start && (!Number.isFinite(startValue) || !Number.isInteger(startValue))) {
      setError("Start time must be a whole number of seconds.");
      return;
    }
    if (end && (!Number.isFinite(endValue) || !Number.isInteger(endValue))) {
      setError("End time must be a whole number of seconds.");
      return;
    }
    if (
      startValue !== undefined &&
      endValue !== undefined &&
      endValue <= startValue
    ) {
      setError("End time must be greater than start time.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trimmedUrl,
          interval: intervalValue,
          start: startValue,
          end: endValue,
          format,
          contactSheet,
        }),
      });

      const payload = (await response.json()) as
        | { job: JobPublic }
        | { error: string };

      if (!response.ok || "error" in payload) {
        setError("error" in payload ? payload.error : "Request failed.");
        setIsSubmitting(false);
        return;
      }

      setJob(payload.job);
    } catch (requestError) {
      setError("Request failed. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReset() {
    setJob(null);
    setError(null);
  }

  const inputClass =
    "w-full rounded-xl border border-slate-200/80 bg-white/90 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-800";

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -left-28 -top-30 h-105 w-105 rounded-full bg-linear-to-br from-amber-200 via-orange-200 to-rose-200 opacity-70 blur-3xl animate-soft-glow dark:from-amber-500/20 dark:via-rose-500/20 dark:to-rose-600/10" />
      <div className="pointer-events-none absolute -bottom-40 -right-10 h-90 w-90 rounded-full bg-linear-to-br from-teal-200 via-cyan-200 to-sky-200 opacity-70 blur-3xl animate-soft-glow dark:from-teal-500/20 dark:via-sky-500/20 dark:to-sky-600/10" />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-12 sm:px-10">
        <header className="flex flex-col gap-6 animate-fade-up">
          <div className="flex w-fit items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-4 py-2 text-[11px] uppercase tracking-[0.32em] text-slate-600 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-300">
            Interval capture toolkit
          </div>
          <div className="max-w-3xl space-y-4">
            <h1 className="font-display text-4xl font-semibold leading-tight text-slate-950 dark:text-white sm:text-5xl">
              YouTube Interval Snapshot Extractor
            </h1>
            <p className="text-base leading-relaxed text-slate-600 dark:text-slate-300 sm:text-lg">
              Paste a YouTube link, choose a capture interval, and let the backend
              generate an ordered gallery of stills. Extract snapshots
              automatically every N seconds with server-side yt-dlp and ffmpeg.
            </p>
          </div>
        </header>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-xl shadow-slate-200/40 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-black/30">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  YouTube URL
                </label>
                <input
                  className={inputClass}
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Interval (seconds)
                  </label>
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    step={1}
                    value={interval}
                    onChange={(event) => setInterval(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Output format
                  </label>
                  <select
                    className={inputClass}
                    value={format}
                    onChange={(event) =>
                      setFormat(event.target.value as "jpg" | "png")
                    }
                  >
                    <option value="jpg">JPG</option>
                    <option value="png">PNG</option>
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/60 bg-slate-50/60 p-4 text-sm text-slate-600 dark:border-slate-800/60 dark:bg-slate-900/40 dark:text-slate-300">
                Extract snapshots automatically every N seconds. Optional start
                and end timestamps limit the capture window.
              </div>

              <button
                type="button"
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200/60 px-4 py-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 dark:border-slate-800/60 dark:text-slate-300"
                onClick={() => setAdvancedOpen((value) => !value)}
              >
                Advanced options
                <span>{advancedOpen ? "-" : "+"}</span>
              </button>

              {advancedOpen ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Start time (seconds)
                    </label>
                    <input
                      className={inputClass}
                      type="number"
                      min={0}
                      step={1}
                      value={start}
                      onChange={(event) => setStart(event.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      End time (seconds)
                    </label>
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      step={1}
                      value={end}
                      onChange={(event) => setEnd(event.target.value)}
                      placeholder="Leave blank for full video"
                    />
                  </div>
                  <label className="col-span-full flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300 dark:border-slate-700 dark:bg-slate-900"
                      checked={contactSheet}
                      onChange={(event) => setContactSheet(event.target.checked)}
                    />
                    Generate a contact sheet
                  </label>
                </div>
              ) : null}

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
                  {error}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  className="flex-1 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/30 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  disabled={isSubmitting || Boolean(isWorking)}
                >
                  {submitLabel}
                </button>
                {job ? (
                  <button
                    type="button"
                    className="rounded-2xl border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 dark:border-slate-800 dark:text-slate-300"
                    onClick={handleReset}
                  >
                    New extraction
                  </button>
                ) : null}
              </div>
            </form>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-lg shadow-slate-200/40 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-black/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                    Processing status
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {job ? stageLabel : "Ready"}
                  </p>
                </div>
                <div className="rounded-full border border-slate-200/70 px-3 py-1 text-xs text-slate-500 dark:border-slate-800/70 dark:text-slate-300">
                  {job ? `${job.progress}%` : "0%"}
                </div>
              </div>

              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-linear-to-r from-slate-900 via-slate-700 to-slate-900 transition-all dark:from-slate-100 dark:via-slate-400 dark:to-white"
                  style={{ width: `${job?.progress ?? 0}%` }}
                />
              </div>

              {job?.metadata ? (
                <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start">
                  {job.metadata.thumbnail ? (
                    <img
                      src={job.metadata.thumbnail}
                      alt="Video thumbnail"
                      className="h-28 w-full rounded-2xl object-cover sm:w-40"
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {job.metadata.title}
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Duration: {formatDuration(job.metadata.duration)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Interval: {job.request.interval}s
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Range: {job.request.start ?? 0}s -
                      {job.request.end !== undefined
                        ? ` ${job.request.end}s`
                        : " end"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Format: {job.request.format.toUpperCase()}
                    </p>
                  </div>
                </div>
              ) : null}

              {job?.warnings?.length ? (
                <div className="mt-4 space-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
                  {job.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : null}

              {job?.error ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
                  {job.error}
                </div>
              ) : null}

              {job?.output?.zipUrl ? (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <a
                    href={job.output.zipUrl}
                    className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    Download ZIP
                  </a>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {job.output.zipFilename}
                  </span>
                </div>
              ) : null}
            </div>

            {job ? (
              <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-lg shadow-slate-200/40 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-black/30">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                      Debug log
                    </h3>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Backend steps and tool output for this job.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 dark:border-slate-800 dark:text-slate-300"
                    onClick={() => setDebugOpen((value) => !value)}
                  >
                    {debugOpen ? "Hide" : "Show"}
                  </button>
                </div>

                {debugOpen ? (
                  <div className="mt-4 max-h-64 overflow-auto rounded-2xl border border-slate-200/60 bg-slate-950/95 p-3 text-xs text-slate-100 dark:border-slate-800/60">
                    {logs.length ? (
                      <div className="space-y-2">
                        {logs.map((entry, index) => (
                          <div
                            key={`${entry.time}-${index}`}
                            className="flex flex-wrap items-start gap-2 border-b border-slate-800/70 pb-2 last:border-none last:pb-0"
                          >
                            <span className="min-w-20 text-[10px] text-slate-400">
                              {formatLogTime(entry.time)}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${logLevelStyles[entry.level] ?? logLevelStyles.info}`}
                            >
                              {entry.level}
                            </span>
                            <span className="flex-1 wrap-break-word text-slate-100">
                              {entry.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-400">No debug entries yet.</p>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-lg shadow-slate-200/40 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-black/30">
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Gallery
              </h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {snapshots.length
                  ? `${snapshots.length} snapshots ready.`
                  : "Snapshots will appear here once processing completes."}
              </p>
            </div>
          </div>
        </section>

        {snapshots.length || contactSheetFile ? (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
                Extracted snapshots
              </h2>
              {job?.output?.zipUrl ? (
                <a
                  href={job.output.zipUrl}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                >
                  Download all
                </a>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {contactSheetFile ? (
                <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-3 shadow-lg shadow-slate-200/30 dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-black/30">
                  <div className="overflow-hidden rounded-2xl">
                    <img
                      src={contactSheetFile.url}
                      alt="Contact sheet"
                      className="h-48 w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Contact sheet</span>
                    <a
                      href={contactSheetFile.url}
                      download={contactSheetFile.filename}
                      className="text-slate-700 hover:text-slate-900 dark:text-slate-200"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ) : null}

              {snapshots.map((snapshot) => (
                <div
                  key={snapshot.filename}
                  className="rounded-3xl border border-slate-200/70 bg-white/80 p-3 shadow-lg shadow-slate-200/30 transition hover:-translate-y-1 dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-black/30"
                >
                  <div className="overflow-hidden rounded-2xl">
                    <img
                      src={snapshot.url}
                      alt={`Snapshot at ${snapshot.timestamp} seconds`}
                      className="h-48 w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>{formatTimestamp(snapshot.timestamp)}</span>
                    <a
                      href={snapshot.url}
                      download={snapshot.filename}
                      className="text-slate-700 hover:text-slate-900 dark:text-slate-200"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <footer className="text-xs text-slate-500 dark:text-slate-400">
          Built for automated interval capture. For long videos, consider a
          queue-backed worker in production.
        </footer>
      </div>
    </div>
  );
}
