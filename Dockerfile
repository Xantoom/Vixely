# syntax=docker/dockerfile:1
#
# Built in stages so the slow part, the Rust crates compiled to WebAssembly, is redone only when
# the Rust changes: its stage takes nothing else, and Docker keeps it from one build to the next.
# A change to the app alone installs the packages if they changed, then builds the site.

# The base is pinned: a new Bun image would otherwise start every stage over.
ARG BUN_IMAGE=oven/bun:1.4.3

# ── Stage 1: the tools that compile Rust to WebAssembly ──
FROM ${BUN_IMAGE} AS toolchain
# Rust and wasm-pack compile the crates to WebAssembly.
# clang and llvm compile the C parts of the image codecs (libdeflate) to WebAssembly.
# The path comes first: wasm-pack's installer looks for Rust.
ENV PATH="/root/.cargo/bin:${PATH}"
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates build-essential clang llvm && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --target wasm32-unknown-unknown && \
    # The multithreaded image codecs rebuild the standard library: a pinned nightly (see scripts/build-wasm.ts).
    rustup toolchain install nightly-2026-09-20 --profile minimal --component rust-src --target wasm32-unknown-unknown && \
    curl -sSf https://rustwasm.github.io/wasm-pack/installer/init.sh | sh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# ── Stage 2: the crates, from their own sources only ──
FROM toolchain AS wasm
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY .cargo ./.cargo
COPY vendor ./vendor
COPY vixely-core ./vixely-core
COPY vixely-image ./vixely-image
COPY vixely-audio ./vixely-audio
COPY vixely-gif ./vixely-gif
COPY vixely-subs ./vixely-subs
COPY vixely-truehd ./vixely-truehd
COPY scripts/build-wasm.ts ./scripts/build-wasm.ts
# When the Rust does change, the downloaded crates, the compiler's output and wasm-pack's tools are
# kept between builds (Railway names these caches after the service).
RUN --mount=type=cache,id=s/dd381f8a-c552-42f6-97e3-32a1373c3530-cargo-registry,target=/root/.cargo/registry \
    --mount=type=cache,id=s/dd381f8a-c552-42f6-97e3-32a1373c3530-cargo-target,target=/app/target \
    --mount=type=cache,id=s/dd381f8a-c552-42f6-97e3-32a1373c3530-wasm-pack,target=/root/.cache/.wasm-pack \
    bun scripts/build-wasm.ts --force

# ── Stage 3: the packages ──
FROM ${BUN_IMAGE} AS packages
WORKDIR /app
COPY package.json bun.lock ./
COPY patches ./patches
RUN --mount=type=cache,id=s/dd381f8a-c552-42f6-97e3-32a1373c3530-bun,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# ── Stage 4: the site ──
FROM packages AS site
COPY . .
COPY --from=wasm /app/src/wasm ./src/wasm
# GoatCounter code for counting visits (see src/app/analytics.ts); empty leaves it off.
ARG VITE_GOATCOUNTER=""
ENV VITE_GOATCOUNTER=${VITE_GOATCOUNTER}
# The address Railway serves this deployment at: link previews point to its own picture.
ARG RAILWAY_PUBLIC_DOMAIN=""
ENV RAILWAY_PUBLIC_DOMAIN=${RAILWAY_PUBLIC_DOMAIN}
RUN bun run build:site

# ── Stage 5: the site compressed ahead, so nginx sends each file as it is ──
# Brotli at its best (about a quarter smaller than gzip on the WebAssembly), gzip for the rest.
FROM alpine:3.24 AS compressed
RUN apk add --no-cache brotli
COPY --from=site /app/dist /dist
RUN find /dist -type f -size +255c \( -name '*.js' -o -name '*.mjs' -o -name '*.wasm' -o -name '*.css' \
        -o -name '*.html' -o -name '*.json' -o -name '*.svg' -o -name '*.webmanifest' -o -name '*.txt' \) -print0 | \
    xargs -0 -n 4 -P "$(nproc)" sh -c 'brotli -q 11 -k "$@" && gzip -9 -k "$@"' _

# ── Stage 6: serve ──
# Alpine's nginx, for its Brotli module; the logs go to Railway's.
FROM alpine:3.24
RUN apk add --no-cache nginx nginx-mod-http-brotli && \
    ln -sf /dev/stdout /var/log/nginx/access.log && ln -sf /dev/stderr /var/log/nginx/error.log && \
    rm /etc/nginx/http.d/default.conf
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY --from=compressed /dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
