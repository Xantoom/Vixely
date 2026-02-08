# Deployment Guide

## Overview

Vixely is a static SPA that requires specific HTTP headers for multi-threaded FFmpeg.wasm (SharedArrayBuffer). This
guide covers Railway + GitHub Actions deployment.

## Prerequisites

- Docker installed locally (for testing builds)
- Railway CLI (`npm i -g @railway/cli`) or Railway dashboard access
- GitHub repository connected to Railway

## Docker Build

### Dockerfile

The project uses a multi-stage Dockerfile:

1. **Build stage:** `node:22-alpine` with Bun, runs `bun install && bun run build`
2. **Serve stage:** `nginx:alpine` serving `dist/` with required headers

### Required HTTP Headers

```nginx
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Embedder-Policy "require-corp" always;
```

These are **mandatory** for `SharedArrayBuffer` which FFmpeg.wasm multi-threading depends on.

### Build Locally

```bash
docker build -t vixely .
docker run -p 8080:80 vixely
```

Visit `http://localhost:8080` to verify.

## Railway Configuration

### Environment Variables

| Variable   | Value        | Notes              |
| ---------- | ------------ | ------------------ |
| `PORT`     | `80`         | Railway sets this  |
| `NODE_ENV` | `production` | Build optimization |

### Railway Setup

1. Connect your GitHub repository in Railway dashboard
2. Railway auto-detects the Dockerfile
3. Deploy triggers automatically on push to `main`

### Custom Domain

1. In Railway project settings, add your domain
2. Configure DNS: CNAME to `<project>.up.railway.app`
3. SSL is provisioned automatically

## GitHub Actions

### CI/CD Pipeline (`.github/workflows/deploy.yml`)

The workflow:

1. **On push to `main`:** Triggers build
2. **Build step:** `bun install && bun run build`
3. **Deploy step:** Railway CLI deploys

### Build Verification

Before deploying, the CI runs:

```bash
bun run build
```

This catches TypeScript errors, missing imports, and build failures before they reach production.

## Nginx Configuration

The `nginx.conf` handles:

- SPA routing (all paths → `index.html`)
- COOP/COEP headers for SharedArrayBuffer
- Gzip compression for JS/CSS/WASM
- Cache headers for static assets (1 year for hashed files)
- `ads.txt` static file serving

## Troubleshooting

### SharedArrayBuffer not available

Check browser console for COOP/COEP header issues. Both headers must be present:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

### FFmpeg.wasm fails to load

The WASM core is loaded from unpkg CDN. Verify:

- No CSP blocking `unpkg.com`
- `crossorigin` attribute on external resources
- COEP `require-corp` may block cross-origin resources without CORS headers

### Build fails

```bash
bun run build 2>&1 | head -50
```

Common issues:

- Missing WASM bindings: run `wasm-pack build` in `vixely-core/`
- TypeScript errors: check `bun run build` output
