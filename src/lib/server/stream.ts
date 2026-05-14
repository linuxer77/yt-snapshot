import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

export type StreamOptions = {
  contentType: string;
  filename?: string;
  disposition?: "inline" | "attachment";
};

export function streamFile(filePath: string, options: StreamOptions) {
  const headers = new Headers();
  headers.set("Content-Type", options.contentType);

  if (options.filename) {
    const safeName = options.filename.replace(/"/g, "");
    const disposition = options.disposition ?? "inline";
    headers.set("Content-Disposition", `${disposition}; filename="${safeName}"`);
  }

  const stream = Readable.toWeb(createReadStream(filePath));
  return new NextResponse(stream, { headers });
}
