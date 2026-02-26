# Editor Tabs Unification Design

**Date:** 2026-02-26

## Goal
Unify tab UX across Video, Image, and GIF editors with one consistent stage + mode tab language, and fix visual/layout misalignment in the Image editor sidebar.

## Current Problems
- Each editor uses a different tab interaction model (video strips, image underline tabs, GIF section cards + chips).
- Image sidebar proportions and spacing feel different from video/gif, so cross-editor switching feels inconsistent.
- Activity/status hints are inconsistent across editors.

## Design Direction
- Keep the existing dark, clean visual language.
- Use one reusable tab component for mode-level navigation.
- Keep stage tabs shared and restyle them for stronger affordance and touch targets.
- Preserve editor-specific workflows (GIF has many tools), but present them through the same tab component.

## UX Decisions
- Single interaction model: pill tabs with optional icon + activity dot.
- Horizontal scroll for tab overflow instead of wrapping to avoid layout jumps.
- Larger, consistent tap targets for mobile.
- Keep stage mapping behavior unchanged (mode <-> stage sync remains explicit per editor).

## Accessibility
- Use semantic `button` controls for tabs.
- Ensure visible active state with contrast-safe foreground/background.
- Keep labels text-first with icons as supporting cues.

## Scope
- New shared `EditorModeTabs` component.
- `EditorStageTabs` visual refresh.
- Refactor of video/image/gif tab UIs to the shared component.
- Image sidebar alignment adjustments (width + header spacing consistency).

## Out of Scope
- Reworking editing algorithms or export pipelines.
- Major content changes in mode panels.
