# Wave 1 Baseline Report

Date: 2026-02-25  
Scope: Observability bootstrap and baseline snapshot

## 1. Instrumentation Added

1. Main-thread telemetry emitter:
- `src/utils/telemetry.ts`

2. Object URL lifecycle accounting via global URL patch:
- `src/utils/objectUrlMetrics.ts`
- Activated from `src/main.tsx`

3. Long-task observer hooks on editor routes:
- `src/hooks/useLongTaskObserver.ts`
- Attached in:
  - `src/routes/tools/video.tsx`
  - `src/routes/tools/gif.tsx`
  - `src/routes/tools/image.tsx`

4. Worker/foreground job timing instrumentation:
- `src/hooks/useVideoProcessor.ts`
- `src/workers/ffmpeg-worker.ts`

## 2. Telemetry Controls

1. Performance telemetry toggle:
- `localStorage.setItem('vixely:perf-telemetry', '1')`
- In development builds, telemetry is enabled by default.

2. Existing worker log toggle remains available:
- `localStorage.setItem('vixely:debug-worker-logs', '1')`

3. Telemetry buffer:
- Main-thread events are appended to `window.__VIXELY_TELEMETRY__`.

## 3. Build Snapshot (Production)

Command:
- `bun run build:web`

Top notable artifacts:
- `dist/assets/ffmpeg-worker-BAIVoCGJ.js` -> `1,589.00 kB`
- `dist/assets/mediabunny-ac3-BSZ4oHWa.js` -> `1,146.97 kB`
- `dist/assets/src-XEPeIxCX.js` -> `471.58 kB`
- `dist/assets/react-DiZ23FDG.js` -> `189.64 kB`
- `dist/assets/video-BEgIn6es.js` -> `128.16 kB`
- `dist/assets/gif-J4aSxFqy.js` -> `105.80 kB`
- `dist/assets/image-B68saRZr.js` -> `52.95 kB`
- `dist/assets/useVideoProcessor-CqmI9gXr.js` -> `15.27 kB`

Observed build warning:
- Large chunks above 500kB remain (`ffmpeg-worker`, `mediabunny-ac3`).

## 4. Metrics Emitted (Current Wave)

1. Foreground worker lifecycle (hook):
- `worker_job_queued`
- `worker_job_started`
- `worker_job_first_progress`
- `worker_job_success`
- `worker_job_error`
- `worker_job_cancelled`

2. Worker phase logs (worker -> hook -> telemetry):
- `worker_perf` with events such as:
  - `transcode_done` / `transcode_error`
  - `gif_encode_done` / `gif_encode_error`
  - `extract_gif_frames_done` / `extract_gif_frames_error`
  - `screenshot_done` / `screenshot_error`

3. UI responsiveness:
- `long_task` entries with route scope labels

4. Memory pressure signal proxy:
- Object URL creation/revocation counters via:
  - `object_url_created`
  - `object_url_revoked`

## 5. Validation

1. `bun run lint` -> pass
2. `bun run fmt:check` -> pass
3. `bun run build:web` -> pass

## 6. Next Wave Entry Criteria

Wave 2 (shared shell refactor) can start with this baseline.  
Before enabling Wave 2 by default, capture a comparison snapshot against this report for:
- Long-task frequency/duration per editor route
- Worker queue/start/first-progress/finish timing distributions
- Object URL active-count trend in long sessions

