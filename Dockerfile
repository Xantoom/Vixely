# syntax=docker/dockerfile:1

# Bun is the only JavaScript runtime in the chain, and it appears only here, at
# build time. Production serves static files with no JS process at all, so a Bun
# regression can break the build but never the live site.
ARG BUN_VERSION=1.4.0

FROM oven/bun:${BUN_VERSION}-alpine AS build
WORKDIR /app

# Dependencies first, so a source change does not re-resolve the tree.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# `dist/server` exists only to drive the prerender; it is deliberately left
# behind. Nothing executable reaches the runtime image.
FROM caddy:2-alpine AS runtime
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist/client /srv

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
	CMD wget --spider -q http://127.0.0.1:8080/ || exit 1
