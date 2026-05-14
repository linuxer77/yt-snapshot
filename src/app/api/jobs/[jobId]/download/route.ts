import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getJobDir, readJob } from "@/lib/server/job-store";
import { streamFile } from "@/lib/server/stream";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = await readJob(jobId);
  if (!job?.output?.zipFilename) {
    return NextResponse.json({ error: "Zip is not ready." }, { status: 404 });
  }

  const zipPath = path.join(getJobDir(jobId), job.output.zipFilename);
  try {
    await fs.access(zipPath);
  } catch {
    return NextResponse.json({ error: "Zip file not found." }, { status: 404 });
  }

  return streamFile(zipPath, {
    contentType: "application/zip",
    filename: job.output.zipFilename,
    disposition: "attachment",
  });
}
