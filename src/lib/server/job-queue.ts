import { readPositiveInt } from "@/lib/server/env";
import { processJob } from "@/lib/server/pipeline";

const MAX_CONCURRENT_JOBS = readPositiveInt(
  process.env.MAX_CONCURRENT_JOBS,
  2
);
const MAX_QUEUED_JOBS = readPositiveInt(process.env.MAX_QUEUED_JOBS, 20);

type QueueState = {
  running: Set<string>;
  waiting: string[];
};

// Kept on globalThis so dev-mode hot reloads don't lose track of jobs that
// are still running in the background.
const globalForQueue = globalThis as typeof globalThis & {
  __ytSnapshotQueue?: QueueState;
};
const state: QueueState = (globalForQueue.__ytSnapshotQueue ??= {
  running: new Set(),
  waiting: [],
});

function pump() {
  while (state.running.size < MAX_CONCURRENT_JOBS && state.waiting.length) {
    const jobId = state.waiting.shift()!;
    state.running.add(jobId);

    processJob(jobId)
      .catch((error) => {
        console.error(`[job ${jobId}] Unhandled pipeline error.`, error);
      })
      .finally(() => {
        state.running.delete(jobId);
        pump();
      });
  }
}

export function canEnqueueJob() {
  return state.waiting.length < MAX_QUEUED_JOBS;
}

export function enqueueJob(jobId: string) {
  state.waiting.push(jobId);
  // Start on the next tick so the HTTP response is not held up.
  setTimeout(pump, 0);
}

/** True while this server process is waiting on or running the job. */
export function isJobTracked(jobId: string) {
  return state.running.has(jobId) || state.waiting.includes(jobId);
}
