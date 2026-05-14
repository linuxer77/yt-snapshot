import { NextRequest, NextResponse } from "next/server";
import {
  appendJobLog,
  buildPublicJob,
  cleanupJobs,
  createJob,
} from "@/lib/server/job-store";
import { processJob } from "@/lib/server/pipeline";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { parseJobRequest } from "@/lib/server/validators";

export const runtime = "nodejs";

function getClientId(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.ip ?? "unknown";
}

export async function POST(request: NextRequest) {
  const clientId = getClientId(request);
  const rate = checkRateLimit(clientId, 5, 5 * 60 * 1000);

  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfter) },
      }
    );
  }

  try {
    await cleanupJobs();
    const payload = await request.json();
    const jobRequest = parseJobRequest(payload);
    const job = await createJob(jobRequest);

    await appendJobLog(job.id, {
      time: new Date().toISOString(),
      level: "info",
      message: "Job created.",
    });
    await appendJobLog(job.id, {
      time: new Date().toISOString(),
      level: "debug",
      message: `Request accepted: url=${jobRequest.url}, interval=${jobRequest.interval}s, start=${jobRequest.start ?? 0}s, end=${jobRequest.end ?? "end"}, format=${jobRequest.format}`,
    });

    setTimeout(() => {
      void processJob(job.id);
    }, 0);

    const publicJob = buildPublicJob(job, request.nextUrl.origin);
    return NextResponse.json({ job: publicJob }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
