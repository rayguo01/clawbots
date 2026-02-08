FROM node:22-bookworm-slim AS builder

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY scripts ./scripts
COPY extensions/*/package.json ./extensions/
# Restore extension paths: pnpm needs the full directory structure
RUN for f in extensions/*.json; do \
      dir="extensions/$(basename "$f" .json)"; \
      mkdir -p "$dir" && mv "$f" "$dir/package.json"; \
    done

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ── Production stage ─────────────────────────────────────────
FROM node:22-bookworm-slim

RUN corepack enable

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
COPY --from=builder /app/openclaw.mjs ./

# Create data directories with correct ownership
RUN mkdir -p /home/node/.nanobots /home/node/.nanobots/workspace && \
    chown -R node:node /app /home/node/.nanobots

USER node

ENV NODE_ENV=production
ENV NANOBOTS_STATE_DIR=/home/node/.nanobots

EXPOSE 8080

CMD ["node", "dist/index.js", "gateway", "--allow-unconfigured", "--bind", "lan"]
