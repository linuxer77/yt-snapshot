import { NextRequest, NextResponse } from "next/server";
import {
  appendJobLog,
  buildPublicJob,
  cleanupJobs,
  createJob,
} from "@/lib/server/job-store";
import { readPositiveInt } from "@/lib/server/env";
import { canEnqueueJob, enqueueJob, isJobTracked } from "@/lib/server/job-queue";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { parseJobRequest } from "@/lib/server/validators";

export const runtime = "nodejs";

const RATE_LIMIT_JOBS = readPositiveInt(process.env.RATE_LIMIT_JOBS, 5);
const RATE_LIMIT_WINDOW_MS =
  readPositiveInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 5) * 60 * 1000;

// Uses the first X-Forwarded-For entry. Run behind a reverse proxy that sets
// this header, otherwise clients can spoof it to dodge the rate limit.
function getClientId(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 }
    );
  }

  let jobRequest;
  try {
    jobRequest = parseJobRequest(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Only valid requests count toward the limit, so a typo doesn't lock anyone out.
  const rate = checkRateLimit(
    getClientId(request),
    RATE_LIMIT_JOBS,
    RATE_LIMIT_WINDOW_MS
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a few minutes." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfter) },
      }
    );
  }

  if (!canEnqueueJob()) {
    return NextResponse.json(
      { error: "The server is busy with other videos. Try again in a minute." },
      { status: 503, headers: { "Retry-After": "60" } }
    );
  }

  await cleanupJobs({ isActive: isJobTracked });

  const job = await createJob(jobRequest);
  await appendJobLog(job.id, {
    time: new Date().toISOString(),
    level: "info",
    message: "Job created.",
  });
  await appendJobLog(job.id, {
    time: new Date().toISOString(),
    level: "debug",
    message: `Request accepted: url=${jobRequest.url}, interval=${jobRequest.interval}s, start=${jobRequest.start ?? 0}s, end=${jobRequest.end ?? "end"}, format=${jobRequest.format}, quality=${jobRequest.quality}`,
  });

  enqueueJob(job.id);

  return NextResponse.json({ job: buildPublicJob(job) }, { status: 202 });
}
