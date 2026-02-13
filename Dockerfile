FROM node:22-bookworm-slim AS builder

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY scripts ./scripts
COPY extensions/amap/package.json ./extensions/amap/
COPY extensions/amadeus/package.json ./extensions/amadeus/
COPY extensions/google-places/package.json ./extensions/google-places/
COPY extensions/google-services/package.json ./extensions/google-services/
COPY extensions/memory-core/package.json ./extensions/memory-core/
COPY extensions/notion/package.json ./extensions/notion/
COPY extensions/spotify/package.json ./extensions/spotify/
COPY extensions/telegram/package.json ./extensions/telegram/
COPY extensions/todoist/package.json ./extensions/todoist/
COPY extensions/web-setup/package.json ./extensions/web-setup/
COPY extensions/openweathermap/package.json ./extensions/openweathermap/
COPY extensions/whatsapp/package.json ./extensions/whatsapp/
COPY extensions/ezbookkeeping/package.json ./extensions/ezbookkeeping/
COPY extensions/dropbox/package.json ./extensions/dropbox/
COPY extensions/fitbit/package.json ./extensions/fitbit/
COPY extensions/knowledge-base/package.json ./extensions/knowledge-base/
COPY extensions/microsoft365/package.json ./extensions/microsoft365/
COPY extensions/x-cookie/package.json ./extensions/x-cookie/
COPY extensions/github/package.json ./extensions/github/

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ── Production stage ─────────────────────────────────────────
FROM node:22-bookworm-slim

RUN corepack enable

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      python3 python3-pip curl unzip \
      chromium && \
    pip3 install --break-system-packages uv ddgs && \
    export BUN_INSTALL=/usr/local && curl -fsSL https://bun.sh/install | bash && \
    apt-get purge -y unzip && \
    apt-get autoremove -y && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium
ENV URL_CHROME_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# ── QMD semantic search (optional, off by default) ───────────────────
ARG NANOBOTS_ENABLE_QMD="false"
RUN if [ "$NANOBOTS_ENABLE_QMD" = "true" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git && \
      git clone --depth 1 https://github.com/tobi/qmd.git /opt/qmd && \
      cd /opt/qmd && /usr/local/bin/bun install --frozen-lockfile && \
      printf '#!/bin/sh\nexec /usr/local/bin/bun /opt/qmd/src/qmd.ts "$@"\n' \
        > /usr/local/bin/qmd && \
      chmod +x /usr/local/bin/qmd && \
      apt-get purge -y git && \
      apt-get autoremove -y && \
      apt-get clean && rm -rf /var/lib/apt/lists/*; \
    fi

ARG NANOBOTS_DOCKER_APT_PACKAGES=""
RUN if [ -n "$NANOBOTS_DOCKER_APT_PACKAGES" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $NANOBOTS_DOCKER_APT_PACKAGES && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/extensions ./extensions
COPY --from=builder /app/skills ./skills
COPY --from=builder /app/docs/reference/templates ./docs/reference/templates
COPY --from=builder /app/openclaw.mjs ./

# Create data directories with correct ownership
RUN mkdir -p /home/node/.nanobots /home/node/.nanobots/workspace \
      /home/node/.nanobots/shared/qmd-models && \
    chown -R node:node /app /home/node/.nanobots

USER node

ENV NODE_ENV=production
ENV NANOBOTS_STATE_DIR=/home/node/.nanobots

EXPOSE 8080

CMD ["node", "dist/index.js", "gateway", "--allow-unconfigured", "--bind", "lan"]
