/* eslint-disable @next/next/no-img-element -- frames are served by our own API
   route at full quality; the image optimizer would only re-encode them. */
import { Download } from "lucide-react";
import type { JobPublic, SnapshotPublic } from "@/types/jobs";
import { Timecode } from "@/components/timecode";
import { formatTimecode } from "@/lib/timecode";

const ICON = { size: 16, strokeWidth: 1.5, "aria-hidden": true } as const;

function IconDownload({ href, filename, label }: {
  href: string;
  filename: string;
  label: string;
}) {
  return (
    <a
      href={href}
      download={filename}
      aria-label={label}
      title={label}
      className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors duration-150 ease-out hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Download {...ICON} />
    </a>
  );
}

function FrameCard({ snapshot }: { snapshot: SnapshotPublic }) {
  const timecode = formatTimecode(snapshot.timestamp);

  return (
    <figure>
      <a
        href={snapshot.url}
        target="_blank"
        rel="noopener"
        className="group block overflow-hidden rounded-lg border border-line bg-frame focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <img
          src={snapshot.url}
          alt={`Frame at ${timecode}`}
          loading="lazy"
          decoding="async"
          className="aspect-video w-full object-contain transition-opacity duration-150 ease-out group-hover:opacity-85"
        />
      </a>
      <figcaption className="mt-1 flex items-center justify-between">
        <Timecode seconds={snapshot.timestamp} className="text-fg-secondary" />
        <IconDownload
          href={snapshot.url}
          filename={snapshot.filename}
          label={`Download frame at ${timecode}`}
        />
      </figcaption>
    </figure>
  );
}

/** The finished result, laid out like a contact sheet. */
export function FrameSheet({ job }: { job: JobPublic }) {
  const snapshots = job.output?.snapshots ?? [];
  const contactSheet = job.output?.contactSheet;
  const pdfUrl = job.output?.pdfUrl;

  if (!snapshots.length && !contactSheet) {
    return null;
  }

  const summary = [
    `${snapshots.length} ${snapshots.length === 1 ? "frame" : "frames"}`,
    `every ${job.request.interval} s`,
    job.request.format.toUpperCase(),
  ].join(" · ");

  return (
    <section aria-labelledby="frames-heading" className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="frames-heading" className="text-xl font-medium text-fg">
            Frames
          </h2>
          <p className="mt-1 font-mono text-xs tabular-nums text-fg-muted">
            {summary}
          </p>
        </div>
        {pdfUrl ? (
          <a
            href={pdfUrl}
            download={job.output?.pdfFilename}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg shadow-control transition-colors duration-150 ease-out hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Download {...ICON} />
            Download PDF
          </a>
        ) : null}
      </div>

      {contactSheet ? (
        <figure className="mt-6 rounded-2xl border border-line bg-surface p-2 shadow-card">
          <a
            href={contactSheet.url}
            target="_blank"
            rel="noopener"
            className="block overflow-hidden rounded-lg bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <img
              src={contactSheet.url}
              alt="Contact sheet with every frame in a grid"
              loading="lazy"
              decoding="async"
              className="mx-auto max-h-[560px] w-auto object-contain"
            />
          </a>
          <figcaption className="flex items-center justify-between pt-1 pl-2">
            <span className="text-[13px] text-fg-secondary">Contact sheet</span>
            <IconDownload
              href={contactSheet.url}
              filename={contactSheet.filename}
              label="Download contact sheet"
            />
          </figcaption>
        </figure>
      ) : null}

      <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        {snapshots.map((snapshot) => (
          <li key={snapshot.filename}>
            <FrameCard snapshot={snapshot} />
          </li>
        ))}
      </ul>
    </section>
  );
}
