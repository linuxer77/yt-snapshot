# YouTube Interval Snapshot Extractor

Extract snapshots from a YouTube video at a fixed interval. The backend uses yt-dlp
to fetch the source and ffmpeg to generate frames on a schedule like
`-vf fps=1/INTERVAL`.

## Features

- Paste a YouTube URL, set an interval, and process automatically.
- Optional start and end timestamps to limit the capture range.
- Progress states for fetching, extracting, and packaging.
- Responsive gallery with per-frame downloads and a ZIP export.
- Clear filenames like `video-title_0010s.jpg`.
- Contact sheet generation (optional).

## Requirements

- Node.js 20+
- pnpm
- yt-dlp (available in PATH)
- ffmpeg (available in PATH)

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

```bash
YTDLP_PATH=yt-dlp
FFMPEG_PATH=ffmpeg
JOBS_TTL_MINUTES=60
```

## Notes

- Job output is stored under `.data/jobs` and cleaned after the TTL.
- For long videos, add a worker queue or background job runner.
- The pipeline is modular so local uploads can be added later.

## Possible v2 ideas

- Subtitle-based capture
- Scene detection
- OCR tagging for frames
- Local file uploads and S3 storage
