# ── Stage 1: build ──
FROM oven/bun:1 AS build
WORKDIR /app

# Rust and wasm-pack compile vixely-core to WebAssembly.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates build-essential && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --target wasm32-unknown-unknown && \
    curl -sSf https://rustwasm.github.io/wasm-pack/installer/init.sh | sh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
ENV PATH="/root/.cargo/bin:${PATH}"

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# ── Stage 2: serve ──
FROM nginx:1-alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
