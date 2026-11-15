import type { JobRequest } from "@/types/jobs";

const QUALITIES = ["1080p", "720p", "480p"] as const;
const YOUTUBE_HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com"];

function parseOptionalInteger(
  value: unknown,
  errorMessage: string
): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(errorMessage);
  }
  return parsed;
}

export function isYouTubeUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return false;
  }

  // Match the domain itself or a real subdomain of it. A plain `endsWith`
  // check would also accept hosts like `notyoutube.com`.
  const host = url.hostname.toLowerCase();
  return YOUTUBE_HOSTS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );
}

export function parseJobRequest(payload: unknown): JobRequest {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid request body.");
  }

  const data = payload as Record<string, unknown>;
  const url = typeof data.url === "string" ? data.url.trim() : "";
  if (!url) {
    throw new Error("YouTube URL is required.");
  }
  if (!isYouTubeUrl(url)) {
    throw new Error("Only YouTube URLs are supported.");
  }

  const interval = Number(data.interval);
  if (!Number.isFinite(interval) || interval <= 0 || !Number.isInteger(interval)) {
    throw new Error("Interval must be a whole number of seconds.");
  }

  const start = parseOptionalInteger(
    data.start,
    "Start time must be a whole number of seconds."
  );
  const end = parseOptionalInteger(
    data.end,
    "End time must be a whole number of seconds."
  );

  if (start !== undefined && start < 0) {
    throw new Error("Start time must be 0 or later.");
  }
  if (end !== undefined && end <= 0) {
    throw new Error("End time must be after 0 seconds.");
  }
  if (start !== undefined && end !== undefined && end <= start) {
    throw new Error("End time must be after the start time.");
  }

  let format: JobRequest["format"] = "jpg";
  if (data.format === "png") {
    format = "png";
  } else if (data.format !== undefined && data.format !== "jpg") {
    throw new Error("Format must be jpg or png.");
  }

  let quality: NonNullable<JobRequest["quality"]> = "1080p";
  if (QUALITIES.includes(data.quality as (typeof QUALITIES)[number])) {
    quality = data.quality as (typeof QUALITIES)[number];
  } else if (data.quality !== undefined) {
    throw new Error("Quality must be 1080p, 720p, or 480p.");
  }

  // Strict check: `Boolean("false")` would be true.
  const contactSheet = data.contactSheet === true;

  return {
    url,
    interval,
    start,
    end,
    format,
    quality,
    contactSheet,
  };
}
