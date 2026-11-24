# syntax=docker/dockerfile:1.7
# Builds the Rust generator and the Node server/worker image.
# Used by both the `server` and `worker` services (different commands).

FROM rust:1.92-bookworm AS rust-builder
WORKDIR /src
COPY rust ./rust
RUN cargo build --release --manifest-path rust/Cargo.toml

FROM node:22-bookworm-slim AS node-deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/server/package.json apps/server/
COPY apps/renderer/package.json apps/renderer/
RUN pnpm install --frozen-lockfile --filter @map-exporter/server... --filter @map-exporter/renderer... --filter map-exporter

FROM node:22-bookworm-slim
# MapLibre Native (renderer sidecar) needs GL + X11 libs and a virtual framebuffer.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libcurl4 libglfw3 libuv1 libjpeg62-turbo libpng16-16 libwebp7 libicu72 \
      libopengl0 libgl1 libegl1 xvfb xauth ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY --from=node-deps /app/node_modules ./node_modules
COPY --from=node-deps /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=node-deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=node-deps /app/apps/renderer/node_modules ./apps/renderer/node_modules
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/server ./apps/server
COPY apps/renderer ./apps/renderer
COPY --from=rust-builder /src/rust/target/release/tile-generator /usr/local/bin/tile-generator
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENV NODE_ENV=production
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "--import", "tsx", "apps/server/src/main.ts", "all"]
