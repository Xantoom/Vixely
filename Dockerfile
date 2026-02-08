# ── Stage 1: Build ──
FROM oven/bun:1 AS build
WORKDIR /app

# Install Rust and wasm-pack for WASM compilation
RUN apt-get update && apt-get install -y curl build-essential && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && \
    . $HOME/.cargo/env && \
    rustup target add wasm32-unknown-unknown && \
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Set PATH for cargo and wasm-pack
ENV PATH="/root/.cargo/bin:${PATH}"

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

# Build WASM module first, then Vite app
RUN bun run build:wasm && bun run build

# ── Stage 2: Serve ──
FROM nginx:1-alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
