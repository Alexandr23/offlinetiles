# syntax=docker/dockerfile:1.7
# Builds the static web app and serves it with nginx, proxying /api to the server service.

FROM node:22-bookworm-slim AS builder
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @map-exporter/web... --filter map-exporter
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm --filter @map-exporter/web build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
