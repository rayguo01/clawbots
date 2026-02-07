FROM node:22-bookworm

RUN corepack enable

WORKDIR /app

ARG NANOBOTS_DOCKER_APT_PACKAGES=""
RUN if [ -n "$NANOBOTS_DOCKER_APT_PACKAGES" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $NANOBOTS_DOCKER_APT_PACKAGES && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile

COPY . .
RUN OPENCLAW_A2UI_SKIP_MISSING=1 pnpm build

ENV NODE_ENV=production

# Allow non-root user to write temp files during runtime.
RUN chown -R node:node /app

# Security: run as non-root
USER node

EXPOSE 8080

# Start gateway, bind to all interfaces (required inside Docker container).
CMD ["node", "dist/index.js", "gateway", "--allow-unconfigured", "--bind", "lan"]
