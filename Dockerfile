# ── Stage 1: build ──
FROM oven/bun:1 AS build
WORKDIR /app

# Rust and wasm-pack compile vixely-core to WebAssembly.
# clang and llvm compile the C parts of the image codecs (libdeflate) to WebAssembly.
# The path comes first: wasm-pack's installer looks for Rust.
ENV PATH="/root/.cargo/bin:${PATH}"
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates build-essential clang llvm && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --target wasm32-unknown-unknown && \
    # The multithreaded image codecs rebuild the standard library: a pinned nightly (see scripts/build-wasm.ts).
    rustup toolchain install nightly-2026-09-20 --profile minimal --component rust-src --target wasm32-unknown-unknown && \
    curl -sSf https://rustwasm.github.io/wasm-pack/installer/init.sh | sh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY patches ./patches
RUN bun install --frozen-lockfile

COPY . .
# GoatCounter code for counting visits (see src/app/analytics.ts); empty leaves it off.
ARG VITE_GOATCOUNTER=""
ENV VITE_GOATCOUNTER=${VITE_GOATCOUNTER}
RUN bun run build

# ── Stage 2: serve ──
FROM nginx:1-alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
