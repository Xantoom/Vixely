# Vixely UI/UX, Performance, Compliance, and Monetization Design

Date: 2026-02-25  
Status: Approved  
Owner: Codex + Project Owner

## 1. Context

Vixely is a local-first media suite with three editors:
- Video editor
- Image editor
- GIF editor

The strategic objective is to become best-in-class in browser-native media editing while preserving:
- Local/client-only processing for user media
- Smooth live preview as a primary user experience
- Strong legal and security compliance for EU/non-EU users
- Sustainable monetization with minimal UX impact

Current constraints and observed issues:
- Workspace crowding from fixed side panels and always-present timeline
- Performance bottlenecks in GIF pipeline and large-session memory behavior
- Compliance layer too simple for ad monetization requirements
- Need for controlled ad placement that does not disturb editing

## 2. Product Goals and Non-Goals

### Goals

1. Maximize preview space and clarity across desktop/tablet/mobile.
2. Maintain responsive editing under heavy workloads.
3. Standardize media processing around Mediabunny where it adds clear value.
4. Add monetization with a compact ad panel above export controls.
5. Achieve practical GDPR/ePrivacy/PECR/Swiss and US privacy alignment.

### Non-Goals

1. No intrusive ad formats (popups, interstitials, preview overlays).
2. No server-side upload processing as primary path.
3. No feature shipping that bypasses performance or compliance gates.

## 3. Considered Approaches

### Approach A: Feature-first expansion on current architecture

Pros:
- Fast short-term parity additions

Cons:
- UX debt grows quickly
- Space/performance issues continue

Decision: Rejected.

### Approach B: Compliance-first, shell refactor + performance kernel + feature packs

Pros:
- Solves root UX and runtime bottlenecks
- Supports safe monetization
- Scales toward long-term parity goals

Cons:
- Requires phased sequencing and quality gates

Decision: Selected.

### Approach C: Deep engine rewrite before UX

Pros:
- Strong technical base

Cons:
- Slower visible product gains
- High schedule risk

Decision: Rejected for initial phase.

## 4. High-Level Architecture

### 4.1 Component Architecture

1. `EditorShell` (shared):
- Canvas-first workspace
- Collapsible global rail
- Resizable inspector panel with per-editor persisted width
- Timeline dock with `hidden | compact | full` modes

2. `EditorStageRouter` (shared contract):
- Three stages: `Source`, `Edit`, `Output`
- Stage-local tools rendered in inspector
- Stage/tool reflected in route search params

3. `MediaExecutionLayer`:
- Capability-driven path selection
- Mediabunny-first export planning
- Worker job scheduler and cancellation

4. `ConsentAndAdsLayer`:
- Region-aware consent orchestration
- Consent Mode v2 signal state
- Compact ad slot rendering above export action area

### 4.2 Data Flow

#### UI State Flow

1. User action updates local editor state.
2. Stage/tool state is mirrored into URL search params.
3. Shell preferences persist in local storage (`inspector width`, `timeline mode`, `last stage/tool`).

#### Media Job Flow

1. File ingestion and capability probing.
2. Execution plan selection:
- Path A: copy/remux
- Path B: Mediabunny conversion/transcode
- Path C: fallback path
3. Job queued in persistent worker scheduler.
4. Progress events streamed to UI.
5. Result object URL created with explicit lifecycle cleanup.

#### Consent/Ads Flow

1. Region profile resolved.
2. Default consent state applied (`denied` for sensitive storages/signals).
3. User consent decision updates mode.
4. Ad slot requests only fire in allowed mode.
5. If disallowed/unknown, slot remains placeholder or hidden.

## 5. UI/UX Design

### 5.1 Workspace Layout

1. Preview is primary surface and remains dominant.
2. Inspector is optional, resizable, and can be collapsed quickly.
3. Timeline can be hidden or reduced to compact mode to reclaim vertical space.

### 5.2 Navigation Model

1. All editors adopt the same stage model (`Source`, `Edit`, `Output`).
2. Only one navigation layer is primary at a time to avoid stacked controls.
3. Tool complexity is split into `Quick` and `Advanced` sections.

### 5.3 Export UX

1. Export panels are segmented and task-oriented.
2. Advanced codec/track sections are collapsed by default.
3. Compact ad panel appears above export button, never inside preview.

### 5.4 Responsive Behavior

1. Mobile/tablet uses full-height inspector drawer with sticky actions.
2. Timeline defaults to compact on small screens.
3. Interaction targets remain touch-friendly without sacrificing density.

## 6. Performance Design

### 6.1 Mediabunny-First Policy

1. Use Mediabunny Conversion as the default export/transcode pipeline when feature-fit is strong.
2. Keep live preview in GPU-friendly interactive path (WebGL/WebCodecs where available).
3. Register and use extensions based on task:
- `@mediabunny/ac3` always available for AC-3/E-AC-3 workflows
- `@mediabunny/mp3-encoder` lazy-loaded only when MP3 export is requested

### 6.2 Worker and Scheduling

1. Replace terminate/recreate behavior with persistent worker + priority queue.
2. Priority classes: `probe`, `thumbnail`, `preview-assist`, `export`.
3. Add cancellation tokens and bounded concurrency by device capabilities.

### 6.3 Memory and Throughput

1. Remove unnecessary binary copies using transferables.
2. Redesign GIF processing to avoid full-frame accumulation before encode.
3. Move heavy per-frame operations away from CPU pixel loops where possible.
4. Virtualize large frame lists in UI to keep interaction smooth.

### 6.4 Performance Budgets

Budgets are enforced per wave:
- Interaction latency budget (p75)
- Preview smoothness budget
- Export throughput budget
- Session memory watermark budget

## 7. Compliance and Privacy Design

### 7.1 Regulatory Strategy

1. EEA/UK/CH:
- GDPR/ePrivacy/PECR/Swiss-aligned consent controls
- CMP integration path for ad stack compatibility

2. US:
- Honor applicable opt-out signals including GPC where relevant

### 7.2 Consent Defaults (Approved)

1. Default denied for:
- `ad_storage`
- `analytics_storage`
- `ad_user_data`
- `ad_personalization`

2. For EEA/UK/CH before explicit consent:
- Attempt non-personalized/contextual ad mode
- Suppress requests where consent-safe behavior cannot be guaranteed

### 7.3 Transparency and User Control

1. Upgrade privacy policy and in-app privacy settings entry point.
2. Keep clear statement: media files are processed locally and not uploaded by core workflow.
3. Record consent transitions with non-personal operational logs.

## 8. Security Design

1. Preserve cross-origin isolation needed for high-performance media features.
2. Maintain strong response headers (content type, referrer, framing protections).
3. Introduce CSP rollout in report-only mode, then enforce after tuning.
4. Add ad system kill-switch to disable all ad loading instantly if needed.

## 9. Error Handling and Resilience

### 9.1 Media Processing Errors

1. Every job has explicit states: `queued`, `running`, `cancelled`, `failed`, `done`.
2. Failures surface actionable UI messages and fallback paths.
3. Worker crashes trigger controlled restart with state-safe error reporting.

### 9.2 Consent/Ads Errors

1. If consent service/CMP fails, default to safe non-tracking mode.
2. If ad provider fails or no fill, keep UI stable with reserved-slot placeholder.
3. No blocked editor workflow due to ad failures.

### 9.3 Network and Script Failure

1. Third-party script load failures do not break editing workflows.
2. External monetization scripts are isolated from core media operations.

## 10. Testing Strategy

### 10.1 Unit Testing

1. Capability matrix and pipeline path selection.
2. Store logic for stage/tool routing and shell preferences.
3. Consent state machine and ad-mode gating.

### 10.2 Integration Testing

1. Worker queue scheduling and cancellation semantics.
2. End-to-end media export flow with Mediabunny path and fallback path.
3. Ad slot gating by region + consent state.

### 10.3 End-to-End Testing

1. Video/image/gif workflows across desktop and mobile breakpoints.
2. Consent-regulated region simulations (EEA/UK/CH and non-EEA).
3. Verify no non-essential trackers fire before allowed consent.

### 10.4 Performance Testing

1. Long-task observation and interaction metrics.
2. Memory watermark capture during long GIF/video sessions.
3. Throughput benchmarks for representative exports.

## 11. Rollout Plan

### Wave 1: Observability and Baselines

- Add metrics, profiling, and budget dashboards.
- Establish baseline snapshots for current build.

### Wave 2: Shared Editor Shell Refactor

- Implement new shell layout with resizable inspector and timeline modes.
- Standardize stage-based navigation.

### Wave 3: Performance Kernel

- Persistent worker queue and cancellation.
- Transferables and GIF memory redesign.
- Rerender and list virtualization optimizations.

### Wave 4: Compliance + Monetization

- Consent framework and region policy engine.
- Compact ad slot above export actions.
- Privacy settings and policy refresh.

### Wave 5: Feature Parity Packs

- GIF parity pack
- Video depth pack
- Image advanced pack
- Each gated by performance/compliance checks

## 12. Acceptance Gates

1. Preview remains space-dominant and responsive.
2. No unbounded memory growth in long sessions.
3. No non-essential ad/analytics activity before required consent.
4. Ads remain compact and non-disruptive above export controls.
5. Accessibility and keyboard flows remain intact.

## 13. Risks and Mitigations

1. Risk: compliance mismatch by region.  
Mitigation: region policy table + consent-safe defaults + kill-switch.

2. Risk: performance regressions during feature growth.  
Mitigation: strict merge gates and benchmark snapshots.

3. Risk: ad integration affecting UX.  
Mitigation: hard placement constraints and reserved slot sizing.

## 14. Approved Decisions Log

1. Chosen strategy: Approach 2 (compliance-first phased architecture).
2. Ad placement: allowed in editors only as compact panel above export button.
3. EEA/UK/CH pre-consent behavior: non-personalized/contextual intent with consent-safe suppression fallback.
4. Implementation responsibility: Codex handles end-to-end execution.

## 15. Source References

- Mediabunny conversion and capabilities: https://mediabunny.dev/guide/converting-media-files
- Mediabunny AC3 extension: https://mediabunny.dev/guide/extensions/ac3
- Mediabunny MP3 extension: https://mediabunny.dev/guide/extensions/mp3-encoder
- Google AdSense CMP guidance: https://support.google.com/adsense/answer/13554116?hl=en
- Google User Consent Policy: https://www.google.com/about/company/user-consent-policy-help/
- Consent Mode v2: https://developers.google.com/tag-platform/security/guides/consent
- TCF v2.3 transition information: https://iabeurope.eu/all-you-need-to-know-about-the-transition-to-tcf-v2-3/
- GDPR legal text: https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng
- ePrivacy Directive legal text: https://eur-lex.europa.eu/eli/dir/2002/58/oj/eng
- UK PECR cookie guidance: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/
- Swiss cookie guidance context: https://www.edoeb.admin.ch/en/cookie-guidelines-updated-version
- California GPC: https://oag.ca.gov/privacy/ccpa/gpc

