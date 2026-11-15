import path from "node:path";
import { NextResponse } from "next/server";
import { getJobDir, readJob } from "@/lib/server/job-store";
import { streamFile } from "@/lib/server/stream";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = await readJob(jobId);
  const pdfFilename = job?.output?.pdfFilename;
  if (!pdfFilename) {
    return NextResponse.json({ error: "PDF is not ready." }, { status: 404 });
  }

  const response = await streamFile(path.join(getJobDir(jobId), pdfFilename), {
    contentType: "application/pdf",
    filename: pdfFilename,
    disposition: "attachment",
    cacheControl: "private, no-cache",
  });

  return (
    response ??
    NextResponse.json({ error: "PDF file not found." }, { status: 404 })
  );
}
