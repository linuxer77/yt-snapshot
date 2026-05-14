import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import archiver from "archiver";
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

const YTDLP_BIN = process.env.YTDLP_PATH ?? "yt-dlp";
const FFMPEG_BIN = process.env.FFMPEG_PATH ?? "ffmpeg";
const MAX_LOG_LENGTH = 4000;
const METADATA_MAX_CHARS = Number.parseInt(
  process.env.YTDLP_METADATA_MAX_CHARS ?? "5000000",
  10
);

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
  if (limit === null) {
    return { value: current + chunk, truncated: false };
  }

  const combined = current + chunk;
  if (combined.length <= limit) {
    return { value: combined, truncated: false };
  }

  return { value: combined.slice(-limit), truncated: true };
}

function formatProcessError(
  command: string,
  stderr: string,
  stdout: string
) {
  const message = (stderr || stdout).replace(/\s+/g, " ").trim();
  if (!message) {
    return `${command} failed.`;
  }
  return `${command} failed: ${message}`;
}

async function runProcess(
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
      if (err.code === "ENOENT") {
        reject(new Error(`${command} is not available in PATH.`));
        return;
      }
      reject(error);
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
      reject(new Error(formatProcessError(command, stderr, stdout)));
    });
  });
}

async function ensureBinary(
  command: string,
  label: string,
  versionArgs: string[][] = [["--version"]]
) {
  let lastError: Error | undefined;

  for (const args of versionArgs) {
    try {
      await runProcess(command, args);
      return;
    } catch (error) {
      const err = error as Error;
      lastError = err;
      if (err.message.includes("not available")) {
        throw new Error(`${label} is not installed or not in PATH.`);
      }
    }
  }

  throw lastError ?? new Error(`${label} is not available.`);
}

function mapYtDlpError(message: string) {
  const text = message.toLowerCase();
  if (text.includes("not in path") || text.includes("not installed")) {
    return message;
  }
  if (text.includes("private")) {
    return "This video is private or requires access.";
  }
  if (text.includes("unavailable") || text.includes("not available")) {
    return "This video is unavailable or region blocked.";
  }
  if (text.includes("sign in") || text.includes("age")) {
    return "This video requires sign-in or age verification.";
  }
  return message;
}

function safeBaseName(title: string) {
  const sanitized = sanitizeFilename(title, { replacement: "-" });
  const collapsed = sanitized
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .trim();
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
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
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

async function fetchMetadata(
  url: string,
  onDebug?: (message: string) => void
): Promise<JobMetadata> {
  const {
    stdout,
    stderr,
    stdoutTruncated,
    stderrTruncated,
    stdoutLength,
    stderrLength,
  } = await runProcess(
    YTDLP_BIN,
    [
      "--dump-single-json",
      "--no-warnings",
      "--no-playlist",
      "--no-progress",
      url,
    ],
    { maxOutputLength: METADATA_MAX_CHARS }
  );

  const raw = stdout.trim();
  if (!raw) {
    throw new Error(mapYtDlpError(stderr || "Failed to fetch metadata."));
  }

  const tryParse = (value: string) => {
    const parsed = JSON.parse(value) as {
      title?: string;
      duration?: number;
      thumbnail?: string;
    };
    return {
      title: parsed.title ?? "Untitled",
      duration: parsed.duration,
      thumbnail: parsed.thumbnail,
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
  } catch (error) {
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

async function downloadVideo(url: string, jobDir: string) {
  await runProcess(YTDLP_BIN, [
    "--no-playlist",
    "-f",
    "best[height<=480]",
    "--merge-output-format",
    "mp4",
    "-o",
    path.join(jobDir, "video.%(ext)s"),
    url,
  ]);

  const files = await fs.readdir(jobDir);
  const videoFile = files.find(
    (file) => file.startsWith("video.") && !file.endsWith(".part")
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
  const rawStart = request.start ?? 0;
  const rawEnd = request.end ?? duration;
  const start = Math.max(0, rawStart);
  const end = Math.min(rawEnd, duration);

  if (start !== rawStart) {
    warnings.push("Start time was adjusted to 0 seconds.");
  }
  if (end !== rawEnd) {
    warnings.push("End time was adjusted to the video duration.");
  }
  if (end <= start) {
    throw new Error("End time must be greater than start time.");
  }

  const rangeDuration = end - start;
  if (request.interval > rangeDuration) {
    warnings.push(
      "Interval is longer than the selected range. Only the first frame will be extracted."
    );
  }

  return { start, end, rangeDuration };
}

async function createContactSheet(options: {
  framesDir: string;
  format: "jpg" | "png";
  frameCount: number;
  outputPath: string;
}) {
  const { framesDir, format, frameCount, outputPath } = options;
  const columns = Math.max(1, Math.ceil(Math.sqrt(frameCount)));
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
    `tile=${columns}x${rows}:margin=2:padding=2`,
    "-frames:v",
    "1",
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

  const args = ["-hide_banner", "-loglevel", "error", "-i", videoPath];
  if (start > 0) {
    args.push("-ss", String(start));
  }
  if (end > start) {
    args.push("-t", String(end - start));
  }
  args.push("-vf", `fps=1/${interval}`);

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
    const contactPath = path.join(framesDir, `contact-sheet.${format}`);
    await createContactSheet({
      framesDir,
      format,
      frameCount: extracted.length,
      outputPath: contactPath,
    });
    const finalName = `${baseName}_contact-sheet.${format}`;
    await fs.rename(contactPath, path.join(framesDir, finalName));
    contactSheetFile = { filename: finalName, timestamp: start };
  }

  const maxTimestamp = start + (extracted.length - 1) * interval;
  const padWidth = Math.max(4, String(Math.floor(maxTimestamp)).length);
  const snapshots: SnapshotFile[] = [];

  for (let index = 0; index < extracted.length; index += 1) {
    const timestamp = start + index * interval;
    const oldPath = path.join(framesDir, extracted[index]);

    if (timestamp > end) {
      await fs.rm(oldPath, { force: true });
      continue;
    }

    const filename = `${baseName}_${zeroPad(timestamp, padWidth)}s.${format}`;
    const newPath = path.join(framesDir, filename);
    await fs.rename(oldPath, newPath);
    snapshots.push({ filename, timestamp });
  }

  if (snapshots.length === 0) {
    throw new Error("No frames matched the requested interval.");
  }

  return { snapshots, contactSheet: contactSheetFile };
}

async function createZip(options: {
  jobDir: string;
  framesDir: string;
  zipFilename: string;
}) {
  const { jobDir, framesDir, zipFilename } = options;
  const zipPath = path.join(jobDir, zipFilename);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    output.on("error", (error) => reject(error));
    archive.on("warning", (error) => {
      if (error.code === "ENOENT") {
        return;
      }
      reject(error);
    });
    archive.on("error", (error) => reject(error));

    archive.pipe(output);
    archive.directory(framesDir, false);
    archive.finalize();
  });
}

export async function processJob(jobId: string) {
  const job = await readJob(jobId);
  if (!job) {
    return;
  }

  try {
    await logJob(jobId, "info", "Job started.");
    await logJob(
      jobId,
      "debug",
      `Request: url=${job.request.url}, interval=${job.request.interval}s, start=${job.request.start ?? 0}s, end=${job.request.end ?? "end"}, format=${job.request.format}`
    );

    await updateJob(jobId, {
      status: "running",
      stage: "validating",
      progress: 5,
      error: undefined,
    });

    await logJob(jobId, "debug", "Checking yt-dlp and ffmpeg availability.");
    await ensureBinary(YTDLP_BIN, "yt-dlp", [["--version"], ["-version"]]);
    await ensureBinary(FFMPEG_BIN, "ffmpeg", [["-version"], ["--version"]]);
    await logJob(jobId, "debug", "yt-dlp and ffmpeg are available.");

    await updateJob(jobId, { stage: "fetching_metadata", progress: 12 });
    await logJob(jobId, "info", "Fetching metadata.");
    const metadata = await fetchMetadata(job.request.url, (message) =>
      logJob(jobId, "debug", message)
    );

    await logJob(
      jobId,
      "info",
      `Metadata loaded: title="${metadata.title}", duration=${metadata.duration ?? "unknown"}s`
    );

    if (!metadata.duration || metadata.duration <= 0) {
      throw new Error("Could not determine video duration.");
    }

    const warnings: string[] = [];
    const { start, end } = resolveRange(
      metadata.duration,
      job.request,
      warnings
    );

    await logJob(
      jobId,
      "debug",
      `Range resolved: start=${start}s, end=${end}s, interval=${job.request.interval}s`
    );
    if (warnings.length) {
      for (const warning of warnings) {
        await logJob(jobId, "warn", warning);
      }
    }

    await updateJob(jobId, {
      metadata,
      warnings: warnings.length ? warnings : undefined,
      progress: 20,
    });

    await updateJob(jobId, { stage: "downloading", progress: 30 });
    await logJob(jobId, "info", "Downloading video.");
    const jobDir = getJobDir(jobId);
    const framesDir = getFramesDir(jobId);
    const videoPath = await downloadVideo(job.request.url, jobDir);
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
    await logJob(jobId, "debug", "Temporary video file removed.");

    const output: JobOutput = {
      imageCount: snapshots.length,
      snapshots,
      contactSheet,
    };

    await updateJob(jobId, { output, progress: 75 });

    await updateJob(jobId, { stage: "zipping", progress: 85 });
    await logJob(jobId, "info", "Creating ZIP archive.");
    const zipFilename = `${baseName}_snapshots.zip`;
    await createZip({ jobDir, framesDir, zipFilename });
    await logJob(jobId, "info", `ZIP ready: ${zipFilename}`);

    await updateJob(jobId, {
      status: "done",
      stage: "done",
      progress: 100,
      output: {
        ...output,
        zipFilename,
      },
    });
    await logJob(jobId, "info", "Job completed successfully.");
  } catch (error) {
    const err = error as Error;
    const normalized = err.message.includes("yt-dlp")
      ? mapYtDlpError(err.message)
      : err.message;
    await logJob(jobId, "error", normalized);
    await updateJob(jobId, {
      status: "failed",
      stage: "failed",
      progress: 100,
      error: normalized,
    });
  }
}
