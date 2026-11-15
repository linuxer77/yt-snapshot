"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { JobPublic } from "@/types/jobs";

const POLL_INTERVAL_MS = 1500;

/**
 * Polls a job until it finishes. Requests never overlap, network blips are
 * retried, and a response for a job the user already reset is ignored.
 */
export function useJobPolling(
  jobId: string | undefined,
  finished: boolean,
  setJob: Dispatch<SetStateAction<JobPublic | null>>
) {
  useEffect(() => {
    if (!jobId || finished) {
      return;
    }

    const controller = new AbortController();
    let timer: number | undefined;

    const applyIfCurrent = (update: (job: JobPublic) => JobPublic) =>
      setJob((current) => (current?.id === jobId ? update(current) : current));

    async function poll() {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.status === 404) {
          applyIfCurrent((job) => ({
            ...job,
            status: "failed",
            stage: "failed",
            error:
              "This job is no longer on the server. It may have expired. Start a new extraction.",
          }));
          return;
        }

        if (response.ok) {
          const payload = (await response.json()) as { job: JobPublic };
          applyIfCurrent(() => payload.job);
        }
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        // A dropped request is retried on the next tick.
      }

      if (!controller.signal.aborted) {
        timer = window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [jobId, finished, setJob]);
}
