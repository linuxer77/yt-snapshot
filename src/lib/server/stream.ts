import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

export type StreamOptions = {
  contentType: string;
  filename?: string;
  disposition?: "inline" | "attachment";
  cacheControl?: string;
};

/**
 * Builds a Content-Disposition header that survives non-ASCII filenames.
 * Header values must be Latin-1, so a video titled in Japanese would make
 * `Headers.set` throw. RFC 6266 `filename*` carries the real UTF-8 name and
 * `filename` holds an ASCII fallback for old clients.
 */
export function contentDisposition(
  type: "inline" | "attachment",
  filename: string
) {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** Streams a file from disk, or returns `null` when it doesn't exist. */
export async function streamFile(
  filePath: string,
  options: StreamOptions
): Promise<NextResponse | null> {
  let size: number;
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return null;
    }
    size = stats.size;
  } catch {
    return null;
  }

  const headers = new Headers();
  headers.set("Content-Type", options.contentType);
  headers.set("Content-Length", String(size));
  headers.set("X-Content-Type-Options", "nosniff");
  if (options.cacheControl) {
    headers.set("Cache-Control", options.cacheControl);
  }
  if (options.filename) {
    headers.set(
      "Content-Disposition",
      contentDisposition(options.disposition ?? "inline", options.filename)
    );
  }

  const stream = Readable.toWeb(createReadStream(filePath));
  return new NextResponse(stream as unknown as BodyInit, { headers });
}
