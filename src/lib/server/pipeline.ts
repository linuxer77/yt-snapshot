import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import sanitizeFilename from "sanitize-filename";
import type {
  JobLogLevel,
  JobMetadata,
  JobOutput,
  JobRequest,
  SnapshotFile,
} from "@/types/jobs";
import {
  appendJobLog,
  getFramesDir,
  getJobDir,
  readJob,
  updateJob,
} from "@/lib/server/job-store";
import { readPositiveInt } from "@/lib/server/env";
import { formatTimecode } from "@/lib/timecode";

const YTDLP_BIN = process.env.YTDLP_PATH || "yt-dlp";
const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";
const MAX_LOG_LENGTH = 4000;
const METADATA_MAX_CHARS = readPositiveInt(
  process.env.YTDLP_METADATA_MAX_CHARS,
  5_000_000
);
const MAX_FRAMES = readPositiveInt(process.env.MAX_FRAMES, 300);

// Frames are picked when the clock crosses a multiple of the interval. The
// small tolerance keeps a frame that sits exactly on the end time.
const END_TOLERANCE_SECONDS = 0.05;
const CONTACT_SHEET_TILE_WIDTH = 320;
const CONTACT_SHEET_MAX_COLUMNS = 10;
const PDF_READ_BATCH_SIZE = 30;

const QUALITY_HEIGHT = { "1080p": 1080, "720p": 720, "480p": 480 } as const;

const YTDLP_BASE_ARGS = [
  "--no-update",
  "--js-runtimes",
  "node",
  "--extractor-args",
  "youtube:player_client=tv,web_embedded",
  "--no-playlist",
  "--no-progress",
];

async function logJob(jobId: string, level: JobLogLevel, message: string) {
  const entry = { time: new Date().toISOString(), level, message };
  try {
    await appendJobLog(jobId, entry);
  } catch {
    // Ignore log persistence failures.
  }

  const prefix = `[job ${jobId}]`;
  if (level === "error") {
    console.error(prefix, message);
  } else if (level === "warn") {
    console.warn(prefix, message);
  } else {
    console.info(prefix, message);
  }
}

class MissingBinaryError extends Error {}

type ProcessResult = {
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  stdoutLength: number;
  stderrLength: number;
};

function appendLimited(
  current: string,
  chunk: string,
  limit: number | null
): { value: string; truncated: boolean } {
  const combined = current + chunk;
  if (limit === null || combined.length <= limit) {
    return { value: combined, truncated: false };
  }
  return { value: combined.slice(-limit), truncated: true };
}

/**
 * Picks the line worth showing from a failed process: the last `ERROR:` line
 * when there is one (yt-dlp), otherwise the last line of output.
 */
function summarizeProcessOutput(output: string) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const errorLine = [...lines].reverse().find((line) => /^ERROR:/i.test(line));
  const line = errorLine ?? lines[lines.length - 1] ?? "";
  return line.replace(/^ERROR:\s*/i, "").slice(0, 500);
}

function runProcess(
  command: string,
  args: string[],
  options?: { cwd?: string; maxOutputLength?: number | null }
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const limit = options?.maxOutputLength ?? MAX_LOG_LENGTH;
    const child = spawn(command, args, {
      cwd: options?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stdoutLength = 0;
    let stderrLength = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdoutLength += text.length;
      const updated = appendLimited(stdout, text, limit);
      stdout = updated.value;
      stdoutTruncated = stdoutTruncated || updated.truncated;
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderrLength += text.length;
      const updated = appendLimited(stderr, text, limit);
      stderr = updated.value;
      stderrTruncated = stderrTruncated || updated.truncated;
    });

    child.on("error", (error) => {
      const err = error as NodeJS.ErrnoException;
      reject(
        err.code === "ENOENT"
          ? new MissingBinaryError(`${command} is not available in PATH.`)
          : err
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({
          stdout,
          stderr,
          stdoutTruncated,
          stderrTruncated,
          stdoutLength,
          stderrLength,
        });
        return;
      }
      const summary = summarizeProcessOutput(stderr || stdout);
      const name = path.basename(command);
      reject(new Error(summary ? `${name} failed: ${summary}` : `${name} failed.`));
    });
  });
}

const verifiedBinaries = new Set<string>();

async function ensureBinary(
  command: string,
  label: string,
  envVar: string,
  versionArgs: string[]
) {
  if (verifiedBinaries.has(command)) {
    return;
  }
  try {
    await runProcess(command, versionArgs);
    verifiedBinaries.add(command);
  } catch (error) {
    if (error instanceof MissingBinaryError) {
      throw new Error(
        `${label} is not installed or not in PATH. Install it or set ${envVar}.`
      );
    }
    throw error;
  }
}

/** Turns raw yt-dlp errors into something a person can act on. */
function mapYtDlpError(message: string) {
  const text = message.toLowerCase();
  if (text.includes("private video")) {
    return "This video is private.";
  }
  if (/not a bot|confirm you.?re not a bot/.test(text)) {
    return "YouTube blocked this server with a bot check. Try again later, or update yt-dlp.";
  }
  if (
    /confirm your age|age[- ]restricted|age verification|inappropriate for some users/.test(
      text
    )
  ) {
    return "This video is age-restricted and needs a signed-in account.";
  }
  if (text.includes("members-only") || text.includes("join this channel")) {
    return "This video is only available to channel members.";
  }
  if (
    text.includes("video unavailable") ||
    text.includes("not available in your country") ||
    text.includes("blocked it in your country")
  ) {
    return "This video is unavailable or blocked in this server's region.";
  }
  if (text.includes("unsupported url") || text.includes("not a valid url")) {
    return "That link doesn't point to a YouTube video.";
  }
  return message;
}

async function runYtDlp(args: string[], maxOutputLength?: number | null) {
  try {
    return await runProcess(YTDLP_BIN, [...YTDLP_BASE_ARGS, ...args], {
      maxOutputLength,
    });
  } catch (error) {
    if (error instanceof MissingBinaryError) {
      throw error;
    }
    throw new Error(mapYtDlpError((error as Error).message));
  }
}

function safeBaseName(title: string) {
  const sanitized = sanitizeFilename(title, { replacement: "-" });
  const collapsed = sanitized
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80)
    .replace(/[-.]+$/g, "");
  return collapsed || "video";
}

function zeroPad(value: number, width: number) {
  return String(value).padStart(width, "0");
}

function extractJsonObjects(raw: string) {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(raw.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return objects;
}

type FetchedMetadata = JobMetadata & { isLive: boolean };

async function fetchMetadata(
  url: string,
  onDebug?: (message: string) => void
): Promise<FetchedMetadata> {
  const {
    stdout,
    stderr,
    stdoutTruncated,
    stderrTruncated,
    stdoutLength,
    stderrLength,
  } = await runYtDlp(
    ["--dump-single-json", "--no-warnings", "--", url],
    METADATA_MAX_CHARS
  );

  const raw = stdout.trim();
  if (!raw) {
    throw new Error(
      mapYtDlpError(summarizeProcessOutput(stderr) || "Failed to fetch metadata.")
    );
  }

  const tryParse = (value: string): FetchedMetadata => {
    const parsed = JSON.parse(value) as {
      title?: string;
      duration?: number;
      thumbnail?: string;
      is_live?: boolean;
      live_status?: string;
    };
    return {
      title: parsed.title ?? "Untitled",
      duration: parsed.duration,
      thumbnail: parsed.thumbnail,
      isLive:
        parsed.is_live === true ||
        parsed.live_status === "is_live" ||
        parsed.live_status === "is_upcoming",
    };
  };

  if (stdoutTruncated) {
    onDebug?.(
      `yt-dlp stdout truncated: captured ${stdout.length} of ${stdoutLength} chars.`
    );
  } else {
    onDebug?.(`yt-dlp stdout length: ${stdoutLength} chars.`);
  }

  if (stderrLength) {
    const suffix = stderrTruncated ? " (truncated)" : "";
    onDebug?.(`yt-dlp stderr length: ${stderrLength} chars${suffix}.`);
  }

  try {
    return tryParse(raw);
  } catch {
    const objects = extractJsonObjects(raw);
    if (objects.length) {
      onDebug?.(`yt-dlp stdout contained ${objects.length} JSON object(s).`);
      for (let index = objects.length - 1; index >= 0; index -= 1) {
        try {
          return tryParse(objects[index]);
        } catch {
          // Keep trying older objects.
        }
      }
    }

    const head = raw.slice(0, 280).replace(/\s+/g, " ");
    const tail = raw.slice(-280).replace(/\s+/g, " ");
    onDebug?.(`yt-dlp stdout head: ${head}`);
    onDebug?.(`yt-dlp stdout tail: ${tail}`);

    if (stderr.trim()) {
      onDebug?.(
        `yt-dlp stderr tail: ${stderr
          .trim()
          .slice(-MAX_LOG_LENGTH)
          .replace(/\s+/g, " ")}`
      );
    }

    if (stdoutTruncated) {
      throw new Error(
        "yt-dlp metadata output exceeded capture limit. Increase YTDLP_METADATA_MAX_CHARS."
      );
    }
    throw new Error("Failed to parse metadata from yt-dlp.");
  }
}

async function downloadVideo(
  url: string,
  jobDir: string,
  quality: keyof typeof QUALITY_HEIGHT = "1080p"
) {
  const height = QUALITY_HEIGHT[quality];
  // Frames only need the picture, so skip the audio track entirely.
  const formatSelector = `bestvideo[height<=${height}]/best[height<=${height}]/best`;

  await runYtDlp([
    "-N",
    "4",
    "-f",
    formatSelector,
    "-o",
    path.join(jobDir, "video.%(ext)s"),
    "--",
    url,
  ]);

  const files = await fs.readdir(jobDir);
  const videoFile = files.find(
    (file) =>
      file.startsWith("video.") &&
      !file.endsWith(".part") &&
      !file.endsWith(".ytdl")
  );

  if (!videoFile) {
    throw new Error("Video download failed.");
  }

  return path.join(jobDir, videoFile);
}

function resolveRange(
  duration: number,
  request: JobRequest,
  warnings: string[]
) {
  const start = Math.max(0, request.start ?? 0);
  const requestedEnd = request.end ?? duration;
  const end = Math.min(requestedEnd, duration);

  if (start >= duration) {
    throw new Error(
      `Start time ${formatTimecode(start)} is past the end of the video (${formatTimecode(duration)}).`
    );
  }
  if (request.end !== undefined && end !== requestedEnd) {
    warnings.push(
      `End time was past the end of the video, so it was set to ${formatTimecode(duration)}.`
    );
  }
  if (end <= start) {
    throw new Error("End time must be after the start time.");
  }
  if (request.interval > end - start) {
    warnings.push(
      "The interval is longer than the selected range, so only the first frame was taken."
    );
  }

  return { start, end };
}

function expectedFrameCount(start: number, end: number, interval: number) {
  return Math.floor((end - start) / interval) + 1;
}

async function createContactSheet(options: {
  framesDir: string;
  format: "jpg" | "png";
  frameCount: number;
  outputPath: string;
}) {
  const { framesDir, format, frameCount, outputPath } = options;
  const columns = Math.min(
    CONTACT_SHEET_MAX_COLUMNS,
    Math.max(1, Math.ceil(Math.sqrt(frameCount)))
  );
  const rows = Math.max(1, Math.ceil(frameCount / columns));
  const pattern = path.join(framesDir, `frame_%06d.${format}`);

  await runProcess(FFMPEG_BIN, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-framerate",
    "1",
    "-i",
    pattern,
    "-vf",
    // Downscale first so a long run doesn't produce a 40,000px wide image.
    `scale=${CONTACT_SHEET_TILE_WIDTH}:-2,tile=${columns}x${rows}:margin=8:padding=8:color=0x141415`,
    "-frames:v",
    "1",
    ...(format === "jpg" ? ["-q:v", "3"] : []),
    "-y",
    outputPath,
  ]);
}

async function extractFrames(options: {
  videoPath: string;
  framesDir: string;
  start: number;
  end: number;
  interval: number;
  format: "jpg" | "png";
  baseName: string;
  contactSheet?: boolean;
}): Promise<{ snapshots: SnapshotFile[]; contactSheet?: SnapshotFile }> {
  const {
    videoPath,
    framesDir,
    start,
    end,
    interval,
    format,
    baseName,
    contactSheet,
  } = options;

  await fs.mkdir(framesDir, { recursive: true });
  const outputPattern = path.join(framesDir, `frame_%06d.${format}`);

  // `fps=1/N` would pick the last frame of each N-second window, which lands
  // about N/2 seconds late. Selecting the first frame at or after each
  // multiple of the interval gives frames at exactly start, start+N, ...
  const selectExpr = `isnan(prev_t)+gt(floor(max(t,0)/${interval}),floor(max(prev_t,0)/${interval}))`;

  const args = ["-hide_banner", "-loglevel", "error", "-hwaccel", "auto"];
  if (start > 0) {
    args.push("-ss", String(start));
  }
  args.push(
    "-i",
    videoPath,
    "-t",
    String(end - start + END_TOLERANCE_SECONDS),
    "-an",
    "-sn",
    "-dn",
    "-vf",
    `select='${selectExpr}'`,
    "-fps_mode",
    "vfr"
  );

  if (format === "jpg") {
    args.push("-q:v", "2");
  } else {
    args.push("-compression_level", "6");
  }

  args.push(outputPattern);
  await runProcess(FFMPEG_BIN, args, { cwd: framesDir });

  const extracted = (await fs.readdir(framesDir))
    .filter((file) => file.startsWith("frame_") && file.endsWith(`.${format}`))
    .sort();

  if (extracted.length === 0) {
    throw new Error("No frames were extracted.");
  }

  let contactSheetFile: SnapshotFile | undefined;
  if (contactSheet) {
    const finalName = `${baseName}_contact-sheet.${format}`;
    await createContactSheet({
      framesDir,
      format,
      frameCount: extracted.length,
      outputPath: path.join(framesDir, finalName),
    });
    contactSheetFile = { filename: finalName, timestamp: start };
  }

  const maxTimestamp = start + (extracted.length - 1) * interval;
  const padWidth = Math.max(4, String(Math.floor(maxTimestamp)).length);

  const renameResults = await Promise.all(
    extracted.map(async (file, index) => {
      const timestamp = start + index * interval;
      const oldPath = path.join(framesDir, file);

      if (timestamp > end) {
        await fs.rm(oldPath, { force: true });
        return null;
      }

      const filename = `${baseName}_${zeroPad(timestamp, padWidth)}s.${format}`;
      await fs.rename(oldPath, path.join(framesDir, filename));
      return { filename, timestamp };
    })
  );

  const snapshots = renameResults.filter(
    (item): item is SnapshotFile => item !== null
  );

  if (snapshots.length === 0) {
    throw new Error("No frames matched the requested interval.");
  }

  return { snapshots, contactSheet: contactSheetFile };
}

async function createPdf(options: {
  framesDir: string;
  snapshots: SnapshotFile[];
  pdfPath: string;
  title: string;
}) {
  const { framesDir, snapshots, pdfPath, title } = options;
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(title);
  pdfDoc.setCreator("yt-snapshot");

  // Read files in small concurrent batches, then embed them in order.
  for (let i = 0; i < snapshots.length; i += PDF_READ_BATCH_SIZE) {
    const batch = snapshots.slice(i, i + PDF_READ_BATCH_SIZE);
    const buffers = await Promise.all(
      batch.map((snapshot) =>
        fs.readFile(path.join(framesDir, snapshot.filename))
      )
    );

    for (const [index, buffer] of buffers.entries()) {
      const isPng = batch[index].filename.toLowerCase().endsWith(".png");
      const image = isPng
        ? await pdfDoc.embedPng(buffer)
        : await pdfDoc.embedJpg(buffer);

      // One page per frame, sized to the frame, so it presents edge to edge.
      const page = pdfDoc.addPage([image.width, image.height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  await fs.writeFile(pdfPath, pdfBytes);
}

export async function processJob(jobId: string) {
  const job = await readJob(jobId);
  if (!job) {
    return;
  }

  let videoPath: string | undefined;

  try {
    await logJob(jobId, "info", "Job started.");

    await updateJob(jobId, {
      status: "running",
      stage: "validating",
      progress: 5,
      error: undefined,
    });

    await logJob(jobId, "debug", "Checking yt-dlp and ffmpeg availability.");
    await ensureBinary(YTDLP_BIN, "yt-dlp", "YTDLP_PATH", ["--version"]);
    await ensureBinary(FFMPEG_BIN, "ffmpeg", "FFMPEG_PATH", ["-version"]);
    await logJob(jobId, "debug", "yt-dlp and ffmpeg are available.");

    await updateJob(jobId, { stage: "fetching_metadata", progress: 12 });
    await logJob(jobId, "info", "Fetching metadata.");
    const { isLive, ...metadata } = await fetchMetadata(
      job.request.url,
      (message) => void logJob(jobId, "debug", message)
    );

    await logJob(
      jobId,
      "info",
      `Metadata loaded: title="${metadata.title}", duration=${metadata.duration ?? "unknown"}s`
    );

    if (isLive) {
      throw new Error("Live streams aren't supported. Try again once the stream has ended.");
    }
    if (!metadata.duration || metadata.duration <= 0) {
      throw new Error("Could not determine video duration.");
    }

    const warnings: string[] = [];
    const { start, end } = resolveRange(
      metadata.duration,
      job.request,
      warnings
    );

    const frameCount = expectedFrameCount(start, end, job.request.interval);
    if (frameCount > MAX_FRAMES) {
      throw new Error(
        `That would be ${frameCount.toLocaleString("en-US")} frames, and this server allows up to ${MAX_FRAMES.toLocaleString("en-US")}. Use a longer interval or a shorter range.`
      );
    }

    await logJob(
      jobId,
      "debug",
      `Range resolved: start=${start}s, end=${end}s, interval=${job.request.interval}s, about ${frameCount} frames`
    );
    for (const warning of warnings) {
      await logJob(jobId, "warn", warning);
    }

    await updateJob(jobId, {
      metadata,
      warnings: warnings.length ? warnings : undefined,
      stage: "downloading",
      progress: 25,
    });

    await logJob(jobId, "info", "Downloading video.");
    const jobDir = getJobDir(jobId);
    const framesDir = getFramesDir(jobId);
    videoPath = await downloadVideo(
      job.request.url,
      jobDir,
      job.request.quality
    );
    await logJob(jobId, "info", "Video download complete.");

    await updateJob(jobId, { stage: "extracting", progress: 60 });
    await logJob(
      jobId,
      "info",
      `Extracting frames every ${job.request.interval}s as ${job.request.format.toUpperCase()}.`
    );
    const baseName = safeBaseName(metadata.title);
    const { snapshots, contactSheet } = await extractFrames({
      videoPath,
      framesDir,
      start,
      end,
      interval: job.request.interval,
      format: job.request.format,
      baseName,
      contactSheet: job.request.contactSheet,
    });

    await logJob(
      jobId,
      "info",
      `Extracted ${snapshots.length} frames${contactSheet ? " plus contact sheet" : ""}.`
    );

    await fs.rm(videoPath, { force: true });
    videoPath = undefined;
    await logJob(jobId, "debug", "Temporary video file removed.");

    const output: JobOutput = {
      imageCount: snapshots.length,
      snapshots,
      contactSheet,
    };

    await updateJob(jobId, { output, stage: "creating_pdf", progress: 85 });
    await logJob(jobId, "info", "Creating PDF with all frames.");
    const pdfFilename = `${baseName}_snapshots.pdf`;
    await createPdf({
      framesDir,
      snapshots,
      pdfPath: path.join(jobDir, pdfFilename),
      title: metadata.title,
    });
    await logJob(jobId, "info", `PDF ready: ${pdfFilename}`);

    await updateJob(jobId, {
      status: "done",
      stage: "done",
      progress: 100,
      output: { ...output, pdfFilename },
    });
    await logJob(jobId, "info", "Job completed successfully.");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error.";
    await logJob(jobId, "error", message);
    try {
      await updateJob(jobId, {
        status: "failed",
        stage: "failed",
        progress: 100,
        error: message,
      });
    } catch (updateError) {
      // The job folder may already be gone (cleanup); nothing left to report to.
      console.error(`[job ${jobId}] Could not record failure.`, updateError);
    }
  } finally {
    if (videoPath) {
      await fs.rm(videoPath, { force: true }).catch(() => {});
    }
  }
}
