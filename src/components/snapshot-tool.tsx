"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronDown, CircleAlert, LoaderCircle } from "lucide-react";
import type { JobPublic, JobRequest } from "@/types/jobs";
import { CapturePlan } from "@/components/capture-plan";
import { FrameSheet } from "@/components/frame-sheet";
import { JobPanel } from "@/components/job-panel";
import { SegmentedControl } from "@/components/segmented-control";
import { formatTimecode, parseTimecode } from "@/lib/timecode";
import { useJobPolling } from "@/lib/use-job-polling";

type Format = JobRequest["format"];
type Quality = NonNullable<JobRequest["quality"]>;
type Field = "url" | "interval" | "start" | "end";
type FormError = { message: string; field?: Field };

const FORMAT_OPTIONS = [
  { value: "jpg", label: "JPG" },
  { value: "png", label: "PNG" },
] as const;

const QUALITY_OPTIONS = [
  { value: "1080p", label: "1080p" },
  { value: "720p", label: "720p" },
  { value: "480p", label: "480p" },
] as const;

const ICON = { size: 16, strokeWidth: 1.5, "aria-hidden": true } as const;

const inputClass =
  "h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px] text-fg shadow-control outline-none transition-colors duration-150 ease-out placeholder:text-fg-muted hover:border-fg-muted/60 focus:border-accent focus:ring-3 focus:ring-accent-soft aria-invalid:border-danger";

const disclosureClass =
  "-mx-2 flex h-10 w-[calc(100%+1rem)] cursor-pointer items-center justify-between gap-4 rounded-md px-2 text-sm text-fg-secondary transition-colors duration-150 ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent";

function FormField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      {children}
    </div>
  );
}

export function SnapshotTool() {
  const [url, setUrl] = useState("");
  const [intervalText, setIntervalText] = useState("10");
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
  const [format, setFormat] = useState<Format>("jpg");
  const [quality, setQuality] = useState<Quality>("1080p");
  const [contactSheet, setContactSheet] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [job, setJob] = useState<JobPublic | null>(null);
  const [error, setError] = useState<FormError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const isWorking =
    job !== null && job.status !== "done" && job.status !== "failed";
  useJobPolling(job?.id, !isWorking, setJob);

  const interval = intervalText.trim() === "" ? Number.NaN : Number(intervalText);
  const start = parseTimecode(startText);
  const end = parseTimecode(endText);

  const hasRange =
    (start !== undefined && !Number.isNaN(start)) ||
    (end !== undefined && !Number.isNaN(end));
  const optionsSummary = [
    hasRange
      ? `${formatTimecode(start || 0)} – ${end !== undefined && !Number.isNaN(end) ? formatTimecode(end) : "end"}`
      : null,
    contactSheet ? "contact sheet" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const fieldProps = (field: Field) => ({
    id: `field-${field}`,
    "aria-invalid": error?.field === field ? true : undefined,
    "aria-describedby": error?.field === field ? "form-error" : undefined,
  });

  function fail(message: string, field?: Field) {
    setError({ message, field });
    if (!field) {
      return;
    }
    if (field === "start" || field === "end") {
      setOptionsOpen(true);
    }
    requestAnimationFrame(() => {
      document.getElementById(`field-${field}`)?.focus();
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      return fail("Paste a YouTube link first.", "url");
    }
    if (!Number.isInteger(interval) || interval <= 0) {
      return fail("The interval must be a whole number of seconds, 1 or more.", "interval");
    }
    if (Number.isNaN(start)) {
      return fail("Write the start time as seconds or a timecode, like 90 or 1:30.", "start");
    }
    if (Number.isNaN(end)) {
      return fail("Write the end time as seconds or a timecode, like 90 or 1:30.", "end");
    }
    if (end !== undefined && end <= (start ?? 0)) {
      return fail("The end time must be after the start time.", "end");
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trimmedUrl,
          interval,
          start,
          end,
          format,
          quality,
          contactSheet,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        job?: JobPublic;
        error?: string;
      } | null;

      if (!response.ok || !payload?.job) {
        fail(
          payload?.error ??
            `The server answered with an error (${response.status}). Try again.`
        );
        return;
      }

      setJob(payload.job);
      // On narrow screens the status panel sits below the form.
      if (window.matchMedia("(max-width: 1023px)").matches) {
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch {
      fail("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReset() {
    setJob(null);
    setError(null);
    document.getElementById("field-url")?.focus();
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <form
          noValidate
          onSubmit={handleSubmit}
          aria-label="Extraction settings"
          className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
        >
          <FormField id="field-url" label="Video link">
            <input
              {...fieldProps("url")}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://www.youtube.com/watch?v=…"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className={inputClass}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField id="field-interval" label="Interval">
              <div className="relative">
                <input
                  {...fieldProps("interval")}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={intervalText}
                  onChange={(event) => setIntervalText(event.target.value)}
                  className={`${inputClass} pr-12 tabular-nums`}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-xs text-fg-muted">
                  sec
                </span>
              </div>
            </FormField>
            <SegmentedControl
              label="Format"
              name="format"
              value={format}
              options={FORMAT_OPTIONS}
              onChange={setFormat}
            />
          </div>

          <SegmentedControl
            label="Quality"
            name="quality"
            value={quality}
            options={QUALITY_OPTIONS}
            onChange={setQuality}
          />

          <div className="border-t border-line pt-3">
            <button
              type="button"
              aria-expanded={optionsOpen}
              aria-controls="more-options"
              onClick={() => setOptionsOpen((value) => !value)}
              className={disclosureClass}
            >
              <span className="flex items-center gap-2">
                <ChevronDown
                  {...ICON}
                  className={`transition-transform duration-150 ease-out ${optionsOpen ? "rotate-180" : ""}`}
                />
                More options
              </span>
              {!optionsOpen && optionsSummary ? (
                <span className="truncate font-mono text-xs text-fg-muted">
                  {optionsSummary}
                </span>
              ) : null}
            </button>

            {optionsOpen ? (
              <div id="more-options" className="mt-3 flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField id="field-start" label="Start">
                      <input
                        {...fieldProps("start")}
                        type="text"
                        autoComplete="off"
                        placeholder="0:00"
                        value={startText}
                        onChange={(event) => setStartText(event.target.value)}
                        aria-describedby={
                          error?.field === "start" ? "form-error" : "range-hint"
                        }
                        className={`${inputClass} font-mono text-sm tabular-nums`}
                      />
                    </FormField>
                    <FormField id="field-end" label="End">
                      <input
                        {...fieldProps("end")}
                        type="text"
                        autoComplete="off"
                        placeholder="End of video"
                        value={endText}
                        onChange={(event) => setEndText(event.target.value)}
                        aria-describedby={
                          error?.field === "end" ? "form-error" : "range-hint"
                        }
                        className={`${inputClass} font-mono text-sm tabular-nums placeholder:font-sans`}
                      />
                    </FormField>
                  </div>
                  <p id="range-hint" className="text-[13px] leading-5 text-fg-muted">
                    Seconds or a timecode, like 90 or 1:30
                  </p>
                </div>

                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={contactSheet}
                    onChange={(event) => setContactSheet(event.target.checked)}
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-fg"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-fg">
                      Contact sheet
                    </span>
                    <span className="text-[13px] leading-5 text-fg-muted">
                      One extra image with every frame in a grid
                    </span>
                  </span>
                </label>
              </div>
            ) : null}
          </div>

          {error ? (
            <p
              id="form-error"
              role="alert"
              className="flex items-start gap-2 text-sm leading-6 text-danger"
            >
              <CircleAlert {...ICON} className="mt-1 shrink-0" />
              {error.message}
            </p>
          ) : null}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSubmitting || isWorking}
              className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-fg px-5 text-[15px] font-medium text-bg transition-[background-color,transform,opacity] duration-150 ease-out hover:bg-fg/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
            >
              {isSubmitting || isWorking ? (
                <LoaderCircle {...ICON} className="animate-spin" />
              ) : null}
              {isSubmitting ? "Starting…" : isWorking ? "Working…" : "Extract frames"}
            </button>
            {job ? (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex h-11 cursor-pointer items-center rounded-lg border border-line-strong bg-surface px-4 text-[15px] font-medium text-fg shadow-control transition-colors duration-150 ease-out hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                New extraction
              </button>
            ) : null}
          </div>
        </form>

        <div
          ref={panelRef}
          className="flex scroll-mt-6 flex-col rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6 lg:self-stretch"
        >
          {job ? (
            <JobPanel job={job} />
          ) : (
            <CapturePlan
              interval={interval}
              start={start}
              end={end}
              format={format}
              quality={quality}
              contactSheet={contactSheet}
            />
          )}
        </div>
      </div>

      {job?.output?.snapshots?.length ? (
        <div className="mt-16">
          <FrameSheet job={job} />
        </div>
      ) : null}
    </>
  );
}
