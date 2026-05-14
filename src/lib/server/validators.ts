import type { JobRequest } from "@/types/jobs";

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

function isYouTubeUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return true;
    }
    if (host.endsWith("youtube.com")) {
      return true;
    }
    if (host.endsWith("youtube-nocookie.com")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
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
    throw new Error("Start time must be greater than or equal to 0.");
  }
  if (end !== undefined && end < 0) {
    throw new Error("End time must be greater than or equal to 0.");
  }
  if (start !== undefined && end !== undefined && end <= start) {
    throw new Error("End time must be greater than start time.");
  }

  let format: "jpg" | "png" = "jpg";
  if (data.format === "png") {
    format = "png";
  } else if (data.format !== undefined && data.format !== "jpg") {
    throw new Error("Format must be jpg or png.");
  }

  const contactSheet = Boolean(data.contactSheet);

  return {
    url,
    interval,
    start,
    end,
    format,
    contactSheet,
  };
}
