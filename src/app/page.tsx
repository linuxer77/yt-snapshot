import { LogoMark } from "@/components/logo";
import { SnapshotTool } from "@/components/snapshot-tool";

export default function Home() {
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-4 sm:px-8">
          <span className="flex items-center gap-2 text-[15px] font-medium text-fg">
            <LogoMark className="size-5" />
            yt-snapshot
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-10 pb-24 sm:px-8 sm:pt-14">
        <div className="mb-10 max-w-2xl">
          <h1 className="text-[28px] leading-tight font-medium tracking-[-0.01em] text-balance text-fg sm:text-4xl sm:leading-[1.15]">
            Pull a frame from a YouTube video every few seconds
          </h1>
          <p className="mt-4 max-w-[36rem] text-base leading-7 text-fg-secondary sm:text-[17px]">
            Paste a link and choose an interval. You get timestamped stills to
            download one by one, and a PDF with all of them.
          </p>
        </div>

        <SnapshotTool />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-[13px] leading-5 text-fg-muted sm:flex-row sm:justify-between sm:px-8">
          <p>Runs yt-dlp and ffmpeg on this server. Files are cleaned up automatically.</p>
          <p>Open source, MIT license</p>
        </div>
      </footer>
    </>
  );
}
