# Editor Tabs Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Standardize tab UX across all editors and align the Image editor sidebar layout with Video/GIF.

**Architecture:** Introduce one reusable mode-tab component in `src/components/ui`, keep stage logic in each editor route/store unchanged, and replace editor-specific tab renderers with data-driven tab lists. This minimizes behavior risk while improving consistency.

**Tech Stack:** React 19, TypeScript 5.9, TailwindCSS 4, Zustand.

---

### Task 1: Add shared mode-tab component

**Files:**
- Create: `src/components/ui/EditorModeTabs.tsx`
- Modify: `src/components/ui/index.ts`

**Step 1: Write the component API and typed item model**
- Add generic item model for `id`, `label`, optional `icon`, `description`, `hasActivity`, and `disabled`.

**Step 2: Implement responsive tab rendering**
- Horizontal scroll container.
- Consistent active/inactive states.
- 44px-ish minimum touch target.

**Step 3: Export through UI barrel**
- Add export from `src/components/ui/index.ts`.

### Task 2: Restyle stage tabs used by all editors

**Files:**
- Modify: `src/components/ui/EditorStageTabs.tsx`

**Step 1: Upgrade stage tab visuals**
- Keep stage ids/labels intact.
- Improve active/inactive contrast and layout consistency with new mode tabs.

**Step 2: Keep behavior stable**
- `onChange` behavior unchanged.

### Task 3: Refactor video and image mode tabs

**Files:**
- Modify: `src/components/video/VideoModeTabs.tsx`
- Modify: `src/components/image/ImageSidebar.tsx`
- Modify: `src/routes/tools/image.tsx`

**Step 1: Video mode tabs**
- Replace local tab DOM with shared `EditorModeTabs`.
- Keep existing activity rules for trim/resize/adjust/preset.

**Step 2: Image mode tabs**
- Replace local tab DOM with shared `EditorModeTabs`.
- Add activity signals for resize/adjust/presets/export readiness where relevant.

**Step 3: Image alignment update**
- Match inspector width default to video/gif conventions.
- Harmonize top sidebar spacing/header layout for consistency.

### Task 4: Refactor GIF section and tool tabs

**Files:**
- Modify: `src/routes/tools/gif.tsx`

**Step 1: Section-level tabs**
- Replace section card grid with shared tabs for stage-specific sections.

**Step 2: Tool-level tabs**
- Replace tool chip row with shared tabs while preserving mode mapping.

**Step 3: Preserve stage/mode sync**
- Keep existing `GIF_MODE_STAGE`, `STAGE_TO_GIF_MODE`, and section mapping logic.

### Task 5: Validation and polish

**Files:**
- Modify (if needed): changed files above

**Step 1: Run lint**
- Run: `bun run lint`
- Expected: no errors.

**Step 2: Run formatter**
- Run: `bun run fmt`
- Expected: consistent formatting.

**Step 3: Run focused guideline pass**
- Check changed UI files for interaction/a11y consistency and fix issues.
