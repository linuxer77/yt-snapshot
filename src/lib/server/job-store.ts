import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { JobLogEntry, JobPublic, JobRecord, JobRequest } from "@/types/jobs";

const JOBS_ROOT = path.join(process.cwd(), ".data", "jobs");
const DEFAULT_TTL_MINUTES = Number.parseInt(
  process.env.JOBS_TTL_MINUTES ?? "60",
  10
);
const MAX_LOG_ENTRIES = 200;
const jobLocks = new Map<string, Promise<void>>();

async function withJobLock<T>(jobId: string, task: () => Promise<T>) {
  const previous = jobLocks.get(jobId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });

  jobLocks.set(jobId, previous.then(() => next));
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (jobLocks.get(jobId) === next) {
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
  const id = nanoid(10);
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
  try {
    const raw = await fs.readFile(getJobFile(jobId), "utf8");
    return JSON.parse(raw) as JobRecord;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return null;
    }
    if (err instanceof SyntaxError) {
      throw new Error(
        `Failed to parse job data for ${jobId}. The job file may be corrupted.`
      );
    }
    throw error;
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

export async function cleanupJobs(
  ttlMinutes: number = DEFAULT_TTL_MINUTES
) {
  await ensureJobsRoot();
  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
    return;
  }

  const entries = await fs.readdir(JOBS_ROOT, { withFileTypes: true });
  const now = Date.now();
  const ttlMs = ttlMinutes * 60 * 1000;

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const jobId = entry.name;
        const job = await readJob(jobId);
        const jobDir = getJobDir(jobId);
        const createdAt = job?.createdAt
          ? Date.parse(job.createdAt)
          : (await fs.stat(jobDir)).mtimeMs;

        if (Number.isFinite(createdAt) && now - createdAt > ttlMs) {
          await fs.rm(jobDir, { recursive: true, force: true });
        }
      })
  );
}

export function buildPublicJob(job: JobRecord, origin: string): JobPublic {
  const baseUrl = `${origin.replace(/\/$/, "")}/api/jobs/${job.id}`;
  const snapshots = job.output?.snapshots?.map((snapshot) => ({
    ...snapshot,
    url: `${baseUrl}/images/${encodeURIComponent(snapshot.filename)}`,
  }));
  const contactSheet = job.output?.contactSheet
    ? {
        ...job.output.contactSheet,
        url: `${baseUrl}/images/${encodeURIComponent(
          job.output.contactSheet.filename
        )}`,
      }
    : undefined;

  return {
    ...job,
    output: job.output
      ? {
          imageCount: job.output.imageCount,
          zipFilename: job.output.zipFilename,
          zipUrl: job.output.zipFilename ? `${baseUrl}/download` : undefined,
          snapshots,
          contactSheet,
        }
      : undefined,
  };
}
