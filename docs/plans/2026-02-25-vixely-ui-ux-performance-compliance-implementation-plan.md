# Vixely Implementation Plan

Date: 2026-02-25  
Source design: `docs/plans/2026-02-25-vixely-ui-ux-performance-compliance-design.md`  
Status: Ready for execution

## 1. Plan Goals

1. Deliver the approved Approach 2 in safe, incremental waves.
2. Keep the app usable and releasable after each wave.
3. Enforce performance and compliance gates before feature expansion.

## 2. Delivery Strategy

- Branch strategy: implement on `develop` with small PR-sized commits.
- Feature-flagged rollout for high-risk modules.
- Benchmark snapshots at each wave end.

## 3. Work Breakdown by Wave

## Wave 1 - Observability and Baselines

### Objectives

1. Add visibility into latency, long tasks, memory pressure, worker timings, and consent state.
2. Define and record baseline values before architecture changes.

### Tasks

1. Add a lightweight telemetry utility (local-only by default, optional remote sink behind env flag).
2. Instrument `useVideoProcessor` worker lifecycle:
- queued timestamp
- start timestamp
- first progress timestamp
- completion/failure timestamp
- input/output byte sizes
3. Instrument GIF job phases in worker:
- decode
- transform/effects
- encode
4. Add long-task observer in editor routes.
5. Add object URL accounting for create/revoke paths.
6. Add benchmark scripts and markdown report template.

### Target Files

- `src/hooks/useVideoProcessor.ts`
- `src/workers/ffmpeg-worker.ts`
- `src/routes/tools/video.tsx`
- `src/routes/tools/gif.tsx`
- `src/routes/tools/image.tsx`
- `src/utils/*` (new telemetry helpers)
- `docs/plans/*` (benchmark snapshots)

### Exit Criteria

1. Baseline report committed.
2. Instrumentation toggle can be disabled in production path.
3. No UX regression from instrumentation overhead.

## Wave 2 - Shared Editor Shell Refactor

### Objectives

1. Make preview area primary across all editors.
2. Standardize `Source | Edit | Output` navigation model.
3. Add inspector resize/collapse and timeline modes.

### Tasks

1. Build shared `EditorShell` component with slots:
- preview
- timeline
- inspector
- action footer
2. Build `EditorStageTabs` and state persistence utility.
3. Add per-editor inspector width persistence.
4. Replace fixed desktop sidebars in video/gif/image routes.
5. Extend timeline component with display modes (`hidden`, `compact`, `full`).
6. Implement responsive drawer behavior for mobile/tablet.
7. Split monolithic video export panel into grouped sections with progressive disclosure.

### Target Files

- `src/routes/__root.tsx`
- `src/routes/tools/video.tsx`
- `src/routes/tools/gif.tsx`
- `src/routes/tools/image.tsx`
- `src/components/ui/Timeline.tsx`
- `src/components/ui/Drawer.tsx`
- `src/components/ui/*` (new shell primitives)
- `src/stores/*` (shell preference state)

### Exit Criteria

1. Preview surface is larger than current baseline at common desktop and mobile sizes.
2. Stage model active in all three editors.
3. Keyboard navigation remains functional.

## Wave 3 - Performance Kernel

### Objectives

1. Remove major memory and throughput bottlenecks.
2. Stabilize worker behavior under heavy usage.

### Tasks

1. Introduce persistent worker scheduler with queue priorities and cancellation tokens.
2. Replace terminate/recreate worker cancellation strategy.
3. Reduce binary copying via transferables at worker boundaries.
4. Redesign GIF pipeline to avoid full-frame accumulation.
5. Limit concurrent decode and heavy operations by device tier.
6. Reduce rerender pressure:
- narrow Zustand subscriptions
- memoize heavy components
7. Virtualize GIF frame strip and optimize O(n) frame operations.
8. Audit font/blob URL lifecycle for leak prevention.

### Target Files

- `src/hooks/useVideoProcessor.ts`
- `src/workers/ffmpeg-worker.ts`
- `src/modules/gif-editor/encode/gif-encoder.ts`
- `src/components/gif/GifFramesPanel.tsx`
- `src/routes/tools/gif.tsx`
- `src/components/video/VideoPlayer.tsx`
- `src/stores/gifEditor.ts`

### Exit Criteria

1. Memory watermark reduced for long GIF jobs.
2. Export completion and cancellation are stable under repeated runs.
3. Interaction smoothness improves versus wave-1 baseline.

## Wave 4 - Compliance and Monetization

### Objectives

1. Make consent and ad behavior region-safe.
2. Add compact ad unit above export buttons without disturbing editing.

### Tasks

1. Implement consent domain model and region policy engine.
2. Integrate consent mode signal flow before tag activation.
3. Add CMP integration path for EEA/UK/CH requirements.
4. Implement ad slot component with strict constraints:
- compact height
- reserved space to avoid layout shift
- above export CTA only
5. Add fallback behavior when consent or ad loading is unavailable.
6. Add privacy settings entry and policy text updates.
7. Add global ad kill-switch.

### Target Files

- `src/components/CookieBanner.tsx` (replace with granular consent UI)
- `src/components/PrivacyModal.tsx`
- `src/routes/privacy.tsx`
- `src/routes/tools/video.tsx`
- `src/routes/tools/gif.tsx`
- `src/routes/tools/image.tsx`
- `src/components/*` (new ad slot + consent modules)
- `src/stores/*` (consent/region state)

### Exit Criteria

1. No non-essential ad/analytics activity before required consent.
2. Ad slot does not block or overlay editing UI.
3. Region behavior matches policy matrix.

## Wave 5 - Feature Parity Packs

### Objectives

1. Expand functionality after architecture and compliance are stable.

### Packs

1. GIF parity pack.
2. Video depth pack.
3. Image advanced pack.

### Execution Rule

- Each pack ships only if wave-3 and wave-4 gates remain green.

## 4. Mediabunny Adoption Plan

### Policy

1. Prefer Mediabunny `Conversion` pipeline for export/transcode tasks.
2. Keep custom paths only where mandatory for live interactivity or unsupported transforms.

### Tasks

1. Build capability resolver utility:
- probe encodable video/audio codecs
- map user settings to best available path
2. Register `@mediabunny/ac3` globally in worker init path.
3. Lazy-load `@mediabunny/mp3-encoder` only for MP3 export requests.
4. Add conversion path unit tests for codec/container compatibility.

## 5. Compliance Matrix to Implement

1. EEA/UK/CH:
- consent required for personalized ads
- pre-consent default: non-personalized/contextual intent
- suppress ad request when consent-safe path is not possible
2. Non-EEA:
- local law-based consent logic
- honor GPC and state opt-out requirements where applicable

## 6. Testing and Verification Plan

### Automated

1. Unit tests:
- capability resolver
- consent state transitions
- queue scheduler state machine
2. Integration tests:
- worker cancel/retry
- ad slot gating
- timeline mode persistence
3. E2E tests:
- full flows for video/image/gif with regional consent scenarios

### Manual

1. Browser matrix:
- Chromium
- Firefox
- Safari (where supported)
2. Device profiles:
- low-memory laptop
- modern desktop
- mobile viewport

### Performance checks

1. Compare each wave against baseline report.
2. Reject merge if critical budget regressions appear.

## 7. Risk Register

1. Risk: ad stack complexity delays product work.  
Mitigation: isolate consent/ad modules with feature flags.

2. Risk: worker refactor introduces regressions.  
Mitigation: preserve existing path behind fallback flag during migration.

3. Risk: parity pack scope explosion.  
Mitigation: split into bounded packs with strict entry criteria.

## 8. Implementation Order Inside Each Wave

For every wave:
1. Add tests first for changed behavior.
2. Implement behind feature flags.
3. Validate lint/format/build.
4. Capture benchmark snapshot.
5. Enable by default only after gate pass.

## 9. Done Definition

A wave is done only if all are true:
1. Functional goals delivered.
2. Lint and formatter checks pass.
3. Build passes.
4. Relevant tests pass.
5. Benchmark and compliance gate checks pass.
6. Documentation updated.

## 10. Immediate Next Sprint (Execution Starter)

1. Wave 1 tasks 1-3: instrumentation utilities + worker lifecycle metrics + GIF phase timings.
2. Wave 1 tasks 4-6: long-task observer + URL accounting + first baseline report.
3. Start Wave 2 shell scaffolding after baseline is committed.

