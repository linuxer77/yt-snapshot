import path from "node:path";
import { NextResponse } from "next/server";
import { getFramesDir, isValidJobId } from "@/lib/server/job-store";
import { streamFile } from "@/lib/server/stream";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string; filename: string }> }
) {
  const { jobId, filename } = await params;
  const contentType = CONTENT_TYPES[path.extname(filename).toLowerCase()];

  if (!isValidJobId(jobId) || path.basename(filename) !== filename || !contentType) {
    return NextResponse.json({ error: "Invalid image path." }, { status: 400 });
  }

  const response = await streamFile(path.join(getFramesDir(jobId), filename), {
    contentType,
    filename,
    disposition: "inline",
    // A job's frames never change once written.
    cacheControl: "private, max-age=3600, immutable",
  });

  return (
    response ??
    NextResponse.json({ error: "Image not found." }, { status: 404 })
  );
}
