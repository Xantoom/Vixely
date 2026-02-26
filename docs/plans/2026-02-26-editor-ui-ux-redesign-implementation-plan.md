# Editor UI/UX Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify the Video/Image/GIF editor UI/UX with a default `Simple` mode, an optional `Expert` mode, and a persisted preference.

**Architecture:** Create a shared UI layer for editor shells, centralize consistency rules, and migrate each editor onto this base while keeping existing media pipelines intact. Complexity level (`Simple|Expert`) is controlled by a persisted store.

**Tech Stack:** React 19, TypeScript 5.9, TailwindCSS 4, Zustand, TanStack Router.

---

### Task 1: Add global UX mode store with persistence

**Files:**
- Create: `src/stores/editorUx.ts`
- Modify: `src/stores/app.ts` (if needed for app-level wiring)
- Modify: `src/routes/__root.tsx` (if top-level mode switch is chosen)

**Step 1: Define strict type model**
- Add `EditorUxMode = 'simple' | 'expert'`.
- Add persisted state key (for example `vixely:ux:mode`).

**Step 2: Implement store actions**
- `setMode(mode)`, `toggleMode()`, `hydrateFromStorage()`.
- Ensure safe fallback to `'simple'`.

**Step 3: Persist and rehydrate**
- Save mode on change.
- Rehydrate once on app boot.

**Step 4: Guard invalid storage values**
- Parse defensively and fallback to `'simple'`.

**Step 5: Verify with type-check lint**
- Run: `bun run lint`
- Expected: PASS (no new type errors).

### Task 2: Build shared editor shell primitives

**Files:**
- Create: `src/components/editor/EditorShell.tsx`
- Create: `src/components/editor/EditorShellHeader.tsx`
- Create: `src/components/editor/EditorFileSummary.tsx`
- Create: `src/components/editor/EditorQuickActions.tsx`
- Create: `src/components/editor/EditorEmptyState.tsx`
- Create: `src/components/editor/index.ts`
- Modify: `src/components/ui/index.ts` (export integration if needed)

**Step 1: Create `EditorShell` layout API**
- Accept slots: `header`, `workspace`, `timeline`, `inspector`, `mobileDrawer`, `actions`.

**Step 2: Create unified header component**
- Include title/subtitle, stage tabs slot, file summary slot, and mode switch slot.

**Step 3: Create unified empty state component**
- Same typography scale, spacing, CTA placement, drag-active variant.

**Step 4: Create unified quick actions footer**
- Primary action + secondary action + status/error row.

**Step 5: Add lightweight a11y contracts**
- Required `ariaLabel` for icon-only actions.
- Keyboard-accessible tab order in each primitive.

### Task 3: Add consistency tokens/config

**Files:**
- Create: `src/config/editorUx.ts`
- Modify: `src/styles.css`

**Step 1: Centralize copy and UI constants**
- Section labels, standard microcopy, sizing constants.

**Step 2: Add reusable visual tokens**
- Title/label scales, shared paddings, shared borders for panel families.

**Step 3: Remove editor-specific visual drift**
- Normalize repeated utility combinations for headers, file rows, and action strips.

**Step 4: Keep per-editor accent colors**
- Preserve `data-editor` accent system already in `styles.css`.

### Task 4: Migrate Video editor to shared shell + Simple/Expert

**Files:**
- Modify: `src/routes/tools/video.tsx`
- Modify: `src/components/video/VideoModeTabs.tsx`
- Modify: `src/components/video/ResizePanel.tsx`
- Modify: `src/components/video/AdjustPanel.tsx`
- Modify: `src/components/video/PresetsPanel.tsx`

**Step 1: Replace route-level scaffold**
- Use `EditorShell` sections while preserving existing processor/store logic.

**Step 2: Inject UX mode**
- Read `EditorUxMode` from store.
- Keep `Simple` default path.

**Step 3: Gate advanced export controls**
- `Simple`: show preset-first and core output choices.
- `Expert`: show codec/container/rate-control/audio/subtitle advanced blocks.

**Step 4: Align empty state + file row + actions**
- Reuse shared components for consistency with image/gif.

**Step 5: Regression check**
- Manual flow: import, trim, resize, export, download in both modes.

### Task 5: Migrate Image editor to shared shell + Simple/Expert

**Files:**
- Modify: `src/routes/tools/image.tsx`
- Modify: `src/components/image/ImageSidebar.tsx`
- Modify: `src/components/image/ImageToolbar.tsx`

**Step 1: Move to shared shell framing**
- Keep canvas behavior intact.

**Step 2: Standardize sidebar header structure**
- Match Video/GIF header hierarchy exactly (title -> stage -> modes -> file).

**Step 3: Apply mode gating**
- `Simple`: resize, basic adjust, preset, export essentials.
- `Expert`: full fine-tuning controls and advanced output options.

**Step 4: Normalize typography and spacing**
- Remove remaining image-only size/placement drift.

**Step 5: Regression check**
- Manual flow: load image, adjust, compare, export in both modes.

### Task 6: Migrate GIF editor to shared shell + Simple/Expert

**Files:**
- Modify: `src/routes/tools/gif.tsx`
- Modify: `src/components/gif/GifSettingsPanel.tsx`
- Modify: `src/components/gif/GifExportPanel.tsx`
- Modify: `src/components/gif/GifFiltersPanel.tsx` (if needed for alignment)

**Step 1: Keep existing stage/mode mapping**
- Preserve `GIF_MODE_STAGE`, `STAGE_TO_GIF_MODE`, section mapping logic.

**Step 2: Standardize shell structure**
- Apply common header, file summary, quick actions, empty state.

**Step 3: Apply mode gating**
- `Simple`: streamlined GIF path (setup -> style -> export essentials).
- `Expert`: full advanced panels (analyze, convert details, frame-level controls).

**Step 4: Unify CTA semantics**
- Same button hierarchy and statuses as video/image.

**Step 5: Regression check**
- Manual flow: import video, generate GIF, download in both modes.

### Task 7: Accessibility and interaction hardening

**Files:**
- Modify: changed editor and shared UI files

**Step 1: Keyboard pass**
- Validate focus order, tab stops, and action reachability.

**Step 2: ARIA pass**
- Ensure all icon-only buttons have explicit labels.
- Ensure mode switch and tabs expose current state.

**Step 3: Focus-visible consistency**
- Remove unnecessary `focus:outline-none` where it weakens visibility.

**Step 4: Contrast pass**
- Check active/inactive tab text/background combinations.

### Task 8: Responsive and performance pass

**Files:**
- Modify: changed editor route files and shared components

**Step 1: Mobile/tablet/desktop parity**
- Validate layout on small phones, tablets, and ultrawide.

**Step 2: Reduce avoidable re-renders**
- Use stable selectors and memoization where inspector panels are heavy.

**Step 3: Keep preview fluidity**
- Ensure UI refactor does not degrade preview interactivity.

### Task 9: Validation, formatting, and handoff

**Files:**
- Modify: all touched files as needed
- Create: `docs/plans/2026-02-26-editor-ui-ux-redesign-validation-report.md`

**Step 1: Lint**
- Run: `bun run lint`
- Expected: PASS

**Step 2: Format**
- Run: `bun run fmt`
- Expected: PASS

**Step 3: Build sanity**
- Run: `bun run build:web`
- Expected: PASS (frontend bundle builds)

**Step 4: Document validation results**
- Add manual QA matrix by editor and by mode (`Simple` / `Expert`).

**Step 5: Commit**
```bash
git add src/components/editor src/stores/editorUx.ts src/routes/tools/video.tsx src/routes/tools/image.tsx src/routes/tools/gif.tsx src/components/image/ImageSidebar.tsx src/components/video/VideoModeTabs.tsx src/styles.css docs/plans/2026-02-26-editor-ui-ux-redesign-validation-report.md
git commit -m "feat(ui): unify editor UX with simple/expert mode and persistent preferences"
```
