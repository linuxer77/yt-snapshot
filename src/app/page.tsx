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
        <h1 className="mb-8 text-2xl leading-tight font-medium text-balance text-fg sm:text-[28px]">
          Extract frames from a YouTube video at a fixed interval
        </h1>

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
