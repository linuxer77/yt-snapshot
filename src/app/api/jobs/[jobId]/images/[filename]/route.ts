import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getFramesDir } from "@/lib/server/job-store";
import { streamFile } from "@/lib/server/stream";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string; filename: string }> }
) {
  const { jobId, filename } = await params;
  const safeName = path.basename(filename);
  if (safeName !== filename) {
    return NextResponse.json({ error: "Invalid filename." }, { status: 400 });
  }

  const filePath = path.join(getFramesDir(jobId), safeName);
  try {
    await fs.access(filePath);
  } catch {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }

  const ext = path.extname(safeName).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : "image/jpeg";

  return streamFile(filePath, {
    contentType,
    filename: safeName,
    disposition: "inline",
  });
}
