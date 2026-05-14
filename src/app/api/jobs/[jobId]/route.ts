import { NextRequest, NextResponse } from "next/server";
import { buildPublicJob, readJob } from "@/lib/server/job-store";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = await readJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const publicJob = buildPublicJob(job, request.nextUrl.origin);
  return NextResponse.json(
    { job: publicJob },
    { headers: { "Cache-Control": "no-store" } }
  );
}
