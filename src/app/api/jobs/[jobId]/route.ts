import { NextResponse } from "next/server";
import {
  buildPublicJob,
  isTerminalStatus,
  readJob,
  updateJob,
} from "@/lib/server/job-store";
import { isJobTracked } from "@/lib/server/job-queue";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  let job = await readJob(jobId);
  if (!job) {
    return NextResponse.json(
      { error: "Job not found." },
      { status: 404, headers: NO_STORE }
    );
  }

  // Jobs run inside this process. If one is unfinished but nothing is working
  // on it, the server restarted mid-run and it will never complete.
  if (!isTerminalStatus(job.status) && !isJobTracked(jobId)) {
    job = await updateJob(jobId, {
      status: "failed",
      stage: "failed",
      progress: 100,
      error: "The server restarted before this job finished. Start it again.",
    });
  }

  return NextResponse.json(
    { job: buildPublicJob(job) },
    { headers: NO_STORE }
  );
}
