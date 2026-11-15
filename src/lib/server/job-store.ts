import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type {
  JobLogEntry,
  JobPublic,
  JobRecord,
  JobRequest,
} from "@/types/jobs";

const JOBS_ROOT = path.join(process.cwd(), ".data", "jobs");
const DEFAULT_TTL_MINUTES = Number.parseInt(
  process.env.JOBS_TTL_MINUTES ?? "60",
  10
);
const MAX_LOG_ENTRIES = 200;
const JOB_ID_LENGTH = 10;
const JOB_ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${JOB_ID_LENGTH}}$`);

// Shared through globalThis because each route can be bundled separately,
// and all writers to a job file must go through the same lock.
const globalForJobs = globalThis as typeof globalThis & {
  __ytSnapshotJobLocks?: Map<string, Promise<void>>;
};
const jobLocks = (globalForJobs.__ytSnapshotJobLocks ??= new Map());

/**
 * Job ids come from URLs, so they are checked before they touch the
 * filesystem. Anything that is not a nanoid could be a path traversal.
 */
export function isValidJobId(jobId: string) {
  return JOB_ID_PATTERN.test(jobId);
}

export function isTerminalStatus(status: JobRecord["status"]) {
  return status === "done" || status === "failed";
}

async function withJobLock<T>(jobId: string, task: () => Promise<T>) {
  const previous = jobLocks.get(jobId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => next);

  jobLocks.set(jobId, chained);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (jobLocks.get(jobId) === chained) {
      jobLocks.delete(jobId);
    }
  }
}

async function writeJobFile(jobId: string, job: JobRecord) {
  const jobDir = getJobDir(jobId);
  const jobFile = getJobFile(jobId);
  const tempFile = path.join(jobDir, "job.json.tmp");

  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(tempFile, JSON.stringify(job, null, 2));
  await fs.rename(tempFile, jobFile);
}

export async function ensureJobsRoot() {
  await fs.mkdir(JOBS_ROOT, { recursive: true });
}

export function getJobDir(jobId: string) {
  return path.join(JOBS_ROOT, jobId);
}

export function getFramesDir(jobId: string) {
  return path.join(getJobDir(jobId), "frames");
}

export function getJobFile(jobId: string) {
  return path.join(getJobDir(jobId), "job.json");
}

export async function createJob(request: JobRequest): Promise<JobRecord> {
  await ensureJobsRoot();
  const id = nanoid(JOB_ID_LENGTH);
  const job: JobRecord = {
    id,
    createdAt: new Date().toISOString(),
    status: "queued",
    stage: "queued",
    progress: 0,
    logs: [],
    request,
  };

  await writeJobFile(id, job);
  return job;
}

export async function readJob(jobId: string): Promise<JobRecord | null> {
  if (!isValidJobId(jobId)) {
    return null;
  }

  let raw: string;
  try {
    raw = await fs.readFile(getJobFile(jobId), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }

  try {
    return JSON.parse(raw) as JobRecord;
  } catch {
    throw new Error(
      `Failed to parse job data for ${jobId}. The job file may be corrupted.`
    );
  }
}

export async function updateJob(
  jobId: string,
  patch: Partial<JobRecord>
): Promise<JobRecord> {
  return withJobLock(jobId, async () => {
    const current = await readJob(jobId);
    if (!current) {
      throw new Error("Job not found.");
    }

    const updated: JobRecord = {
      ...current,
      ...patch,
      request: {
        ...current.request,
        ...(patch.request ?? {}),
      },
      metadata:
        patch.metadata !== undefined
          ? {
              ...(current.metadata ?? {}),
              ...patch.metadata,
            }
          : current.metadata,
      output:
        patch.output !== undefined
          ? {
              ...(current.output ?? {}),
              ...patch.output,
            }
          : current.output,
      warnings: patch.warnings ?? current.warnings,
      logs: patch.logs ?? current.logs,
    };

    await writeJobFile(jobId, updated);
    return updated;
  });
}

export async function appendJobLog(jobId: string, entry: JobLogEntry) {
  await withJobLock(jobId, async () => {
    const current = await readJob(jobId);
    if (!current) {
      throw new Error("Job not found.");
    }

    const logs = [...(current.logs ?? []), entry].slice(-MAX_LOG_ENTRIES);
    const updated: JobRecord = { ...current, logs };
    await writeJobFile(jobId, updated);
  });
}

/**
 * Removes job folders older than the TTL. Never throws: a single unreadable
 * or corrupted job folder must not block new jobs from being created.
 */
export async function cleanupJobs(options?: {
  ttlMinutes?: number;
  isActive?: (jobId: string) => boolean;
}) {
  const ttlMinutes = options?.ttlMinutes ?? DEFAULT_TTL_MINUTES;
  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
    return;
  }

  let entries;
  try {
    await ensureJobsRoot();
    entries = await fs.readdir(JOBS_ROOT, { withFileTypes: true });
  } catch (error) {
    console.warn("[cleanup] Could not read the jobs folder.", error);
    return;
  }

  const now = Date.now();
  const ttlMs = ttlMinutes * 60 * 1000;

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const jobId = entry.name;
        if (options?.isActive?.(jobId)) {
          return;
        }

        const jobDir = getJobDir(jobId);
        try {
          const job = await readJob(jobId).catch(() => null);
          const createdAt = job?.createdAt
            ? Date.parse(job.createdAt)
            : (await fs.stat(jobDir)).mtimeMs;

          if (Number.isFinite(createdAt) && now - createdAt > ttlMs) {
            await fs.rm(jobDir, { recursive: true, force: true });
          }
        } catch (error) {
          console.warn(`[cleanup] Could not clean up job ${jobId}.`, error);
        }
      })
  );
}

export function buildPublicJob(job: JobRecord): JobPublic {
  const baseUrl = `/api/jobs/${job.id}`;
  const imageUrl = (filename: string) =>
    `${baseUrl}/images/${encodeURIComponent(filename)}`;

  const snapshots = job.output?.snapshots?.map((snapshot) => ({
    ...snapshot,
    url: imageUrl(snapshot.filename),
  }));
  const contactSheet = job.output?.contactSheet
    ? {
        ...job.output.contactSheet,
        url: imageUrl(job.output.contactSheet.filename),
      }
    : undefined;

  return {
    ...job,
    output: job.output
      ? {
          imageCount: job.output.imageCount,
          pdfFilename: job.output.pdfFilename,
          pdfUrl: job.output.pdfFilename ? `${baseUrl}/download` : undefined,
          snapshots,
          contactSheet,
        }
      : undefined,
  };
}
