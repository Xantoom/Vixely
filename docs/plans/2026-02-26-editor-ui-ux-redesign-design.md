# Editor UI/UX Redesign Design

**Date:** 2026-02-26

## Goal
Redesign the UI/UX of the Video, Image, and GIF editors to:
- make the experience simpler for beginners,
- preserve deep control for experts,
- guarantee strict visual and structural consistency across all three editors.

## Product Decision (Validated)
- Default mode: **Simple**
- User control: **Simple/Expert switch**
- Persistence: **saved preference**, automatically reapplied

## Current Problems
- Layout inconsistencies between editors (block placement, text hierarchy, empty-state styling).
- Option density is too variable by page, with no clear progression for novice users.
- Cross-editor navigation is mentally expensive (same goal, different patterns).
- Missing a single reusable workflow frame.

## Design Direction
- Keep the current modern dark style without visual rupture.
- Introduce a **shared editor shell** (header, stage, mode tabs, workspace, inspector, actions).
- Encapsulate advanced complexity behind an explicit Expert level.
- Standardize copy, sizing, spacing, naming, and CTA placement.

## Target Personas
### Persona A: Beginner
- Wants fast edits without codec jargon.
- Needs guidance, presets, clear actions, and fewer simultaneous choices.

### Persona B: Power User
- Wants full access (codec, container, bitrate, audio/subtitle tracks, fine controls).
- Accepts a dense UI if it is structured and fast.

## UX Principles
1. Progressive disclosure:
- `Simple` shows only high-impact decisions.
- `Expert` reveals advanced technical sections.
2. Structural consistency:
- Same skeleton and zone order in Video/Image/GIF.
3. Predictable placement:
- Same areas for file info, settings, export actions, and feedback.
4. Zero ambiguity:
- Consistent labels, concise microcopy, explicit states and errors.
5. Accessibility first:
- Keyboard support, visible focus, contrast compliance, non-visual feedback.

## Unified Information Architecture
For each editor:
1. Editor header (title + source type + Simple/Expert switch + file)
2. Stage tabs (`Source`, `Edit`, `Output`)
3. Mode tabs (editor-specific context)
4. Main content (preview/workspace + timeline where applicable)
5. Inspector panel (current mode tools)
6. Footer actions (primary + secondary + state/error feedback)

## Simple vs Expert Scope
### Simple (default)
- Recommended presets shown first.
- Essential settings only:
  - trim,
  - size/aspect,
  - essential color controls,
  - simplified output format.
- Explicit CTA labels (`Generate`, `Export`, `Download`).

### Expert
- All advanced options:
  - codec/container,
  - rate control (CRF/QP/bitrate),
  - audio/subtitle track selection,
  - advanced GIF/image tuning.
- Advanced sections grouped and collapsible.

## Cross-Editor Consistency Rules
- Same spacing grid and same typography sizes for:
  - section titles,
  - labels,
  - monospace values,
  - primary/secondary buttons.
- Harmonized `empty state`, `drag and drop overlay`, and `file info row` events.
- Same mobile drawer / desktop inspector behavior.
- Same activity styling for tabs and badges.

## Accessibility & Compliance
- Full keyboard navigation (tabs, toggles, sliders, panels).
- Consistent visible focus, no unnecessary ring suppression.
- Minimum AA contrast on active/inactive states.
- Normalized ARIA labels for icon-only buttons.
- Unambiguous helper text for errors and destructive actions.

## Performance Constraints
- Keep real-time preview fluid (target: perceived 60fps).
- Avoid unnecessary rerenders in inspector and timeline.
- Limit expensive transitions on frequently updated components.

## Success Metrics
- Reduced time from import to first export in Simple mode.
- Lower novice abandonment/backtracking.
- No major perceived structural differences between Video/Image/GIF.
- No critical a11y defects in keyboard, contrast, and label audits.

## Out of Scope
- Refactoring media pipelines (encoding/decoding).
- New editing features outside UI/UX.
- Stack migration or full external design system replacement.
