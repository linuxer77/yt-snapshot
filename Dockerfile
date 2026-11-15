# syntax=docker/dockerfile:1

# ---- Dependencies -----------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---- Build ------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---- Runtime ----------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# yt-dlp changes often to keep up with YouTube, so the latest release is
# installed by default. Pin one with --build-arg YTDLP_VERSION=2026.03.17.
ARG YTDLP_VERSION=latest

# ffmpeg extracts frames; python3 runs yt-dlp. Node (already in this image)
# is the JavaScript runtime yt-dlp uses for YouTube's player challenges.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates curl \
  && if [ "$YTDLP_VERSION" = "latest" ]; then \
       url="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"; \
     else \
       url="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp"; \
     fi \
  && curl -fsSL "$url" -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && apt-get purge -y curl \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

# Job files (frames, PDFs) live here and are removed after JOBS_TTL_MINUTES.
RUN mkdir -p /app/.data && chown node:node /app/.data
VOLUME ["/app/.data"]

USER node
EXPOSE 3000
CMD ["node", "server.js"]
