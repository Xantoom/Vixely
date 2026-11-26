# Components

Classes start with `x-`, variants are `data-*` attributes, and state comes from native attributes (`disabled`,
`aria-selected`, `aria-current`, `aria-busy`, `:checked`, `[open]`). The design system holds no text: every label,
name and message comes from the app's translations. `demo/index.html` shows each of them working.

## Layout

| Class | What it does |
| --- | --- |
| `x-container` | Centred column with safe-area gutters. `data-width="narrow"` (44 rem) or `"wide"` (120 rem) |
| `x-stack` | Vertical flow. `data-gap="1|2|6|8|12"` (default 4) |
| `x-cluster` | Wrapping row. `data-justify="end|between"`, `data-gap` |
| `x-grid` | As many columns as fit. `data-min="sm|lg"` (11, 16 or 22 rem) |
| `x-split` | Side and main columns. They stack once the main one would drop under 60 % |
| `x-shell` | App frame with `<header>`, `<nav>` and `<main>` children. The nav moves above main under 48 rem |
| `x-prose` | 68ch text column |
| `x-cq` | Makes the element a size container (`cqi` units, `@container`) |

## Actions

```html
<button class="x-button" data-variant="primary" type="submit">Save</button>
<button class="x-button">Cancel</button>
<button class="x-button" data-variant="ghost" data-icon aria-label="Settings"><svg aria-hidden="true">…</svg></button>
<button class="x-button" data-variant="danger">Delete…</button>
<button class="x-button" data-variant="primary" aria-busy="true" disabled>Saving…</button>
<div class="x-button-group">…buttons…</div>
```

`data-size="sm|lg"`, `data-block` (full width). A link that looks like a button is still an `<a href>`.

## Forms

```html
<div class="x-field">
  <label class="x-label" for="email">Email</label>
  <input class="x-input" id="email" name="email" type="email" autocomplete="email" required
         aria-describedby="email-hint" spellcheck="false" autocapitalize="none">
  <p class="x-hint" id="email-hint">…</p>
  <p class="x-error" id="email-error" hidden>…</p>   <!-- show it, set aria-invalid and aria-describedby -->
</div>
<textarea class="x-input" …></textarea>               <!-- grows with its content (field-sizing) -->
<select class="x-select" …><button><selectedcontent></selectedcontent></button><option>…</option></select>
<label class="x-check"><input type="checkbox" class="x-checkbox" name="…"> Label</label>
<label class="x-check"><input type="radio" class="x-radio" name="…"> Label</label>
<label class="x-check"><input type="checkbox" class="x-switch" switch role="switch"> Label</label>
<fieldset class="x-segmented"><legend>View</legend>
  <label><input type="radio" name="view" checked> List</label><label><input type="radio" name="view"> Grid</label>
</fieldset>
<input type="range" class="x-range">  <input type="file" class="x-file">  <fieldset class="x-fieldset"><legend>…</legend>…</fieldset>
```

- A required field gets ` *` after its `.x-label` automatically.
- Invalid fields turn red on `:user-invalid` (after interaction) or `aria-invalid="true"`. On submit, move focus to
  the first error.
- The select's `<button><selectedcontent>` is optional. Chromium and Safari 27 style the picker; elsewhere it is the
  native one.

## Content

| Markup | Notes |
| --- | --- |
| `<article class="x-card">` | `data-variant="flat"`; `data-interactive` with one `<a class="x-card-link">` makes the whole card clickable |
| `<span class="x-badge" data-tone="accent|success|warning|danger|info">` | Always with text, never colour alone |
| `<span class="x-avatar">AB</span>` or with an `<img alt>` | `data-size="sm|lg"`, `data-shape="tile"` (app-icon corner) |
| `<kbd class="x-kbd">⌘</kbd>` | Join keys with `&nbsp;` |
| `<div class="x-callout" data-tone="…" role="status"><svg aria-hidden>…</svg><p>…</p></div>` | Messages in the page. Prefer them to toasts |
| `<div class="x-table-scroll" role="region" aria-label="…" tabindex="0"><table class="x-table">` | Sticky headers. `data-numeric` on number cells. `<tbody data-long>` renders only rows on screen |
| `<details class="x-accordion" name="group"><summary>…</summary><div>…</div></details>` | `name` makes the group exclusive |
| `<div class="x-empty"><svg aria-hidden>…</svg><h3>…</h3><p>…</p><a class="x-button">…</a></div>` | Every empty or error state offers a next step |

## Feedback

```html
<progress class="x-progress" value="40" max="100" aria-label="Upload"></progress>   <!-- no value: indeterminate -->
<meter class="x-meter" …></meter>
<span class="x-spinner" role="status" aria-label="Loading…"></span>
<span class="x-skeleton"></span>   <!-- size it (in the app layer) exactly like the content it stands for -->
```

Show a spinner or skeleton only after about 200 ms, and for at least about 400 ms once shown.

## Navigation

```html
<a class="x-skip-link" href="#main">Skip to content</a>            <!-- first element of <body> -->
<a class="x-navlink" href="/projects" aria-current="page"><svg aria-hidden>…</svg>Projects</a>
<nav aria-label="Breadcrumb"><ol class="x-breadcrumb"><li><a href="/">Home</a></li><li aria-current="page">…</li></ol></nav>
<nav aria-label="Pages"><ul class="x-pagination"><li><a href="?p=1" aria-current="page">1</a></li>…</ul></nav>
<div class="x-tabs">
  <div class="x-tablist" role="tablist" aria-label="…">
    <button class="x-tab" type="button" role="tab" id="t-a" aria-selected="true">A</button>
    <button class="x-tab" type="button" role="tab" id="t-b">B</button>
  </div>
  <div role="tabpanel" aria-labelledby="t-a" tabindex="0">…</div>
  <div role="tabpanel" aria-labelledby="t-b" hidden="until-found">…</div>
</div>
```

Tabs are not page navigation: use links with `aria-current` for that. Write the initial state in the HTML.
`enhance()` adds selection, arrow keys, Home and End, find-in-page, and scrolls the selected tab into view. Put no
padding on the panel itself: put it on a child.

## Overlays

```html
<!-- Modal dialog (a bottom sheet on phones; data-variant="sheet" is a side sheet; data-size="lg") -->
<button class="x-button" command="show-modal" commandfor="confirm">Delete…</button>
<dialog class="x-dialog" id="confirm" aria-labelledby="confirm-title" closedby="any">
  <h1 id="confirm-title">…</h1><p>…</p>
  <form method="dialog" class="x-dialog-actions">
    <button class="x-button" value="cancel" autofocus>Cancel</button>
    <button class="x-button" data-variant="danger" value="delete">Delete</button>
  </form>
</dialog>

<!-- Popover / menu (a group of buttons; add role="menu" + role="menuitem" only with enhance()) -->
<button class="x-button" popovertarget="actions" aria-label="More"><svg aria-hidden>…</svg></button>
<div class="x-menu" id="actions" popover>
  <p class="x-menu-label">…</p>
  <button class="x-menu-item" type="button"><svg aria-hidden>…</svg>Rename…<kbd class="x-kbd">F2</kbd></button>
  <hr class="x-menu-separator">
  <button class="x-menu-item" type="button" data-tone="danger">Delete…</button>
</div>
<div class="x-popover" id="details" popover>…</div>

<!-- Tooltip: the trigger keeps its own accessible name -->
<button class="x-button" data-icon aria-label="Bold" interestfor="tip-bold"><svg aria-hidden>…</svg></button>
<div class="x-tooltip" id="tip-bold" popover="hint">Bold <kbd class="x-kbd">Ctrl</kbd></div>

<!-- Toasts: one region per page, filled by toast() -->
<section class="x-toaster" popover="manual" role="region" aria-label="Notifications" data-close-label="Dismiss"></section>
```

```js
import { enhance, toast, closeTopLayer } from 'xantoom-design/js';
enhance();
toast(t('saved'), { tone: 'success', timeout: 6000 });   // persistent without timeout
```

- Dialogs: name them (`aria-labelledby`), autofocus the primary field or the safe action, close with
  `<form method="dialog">` or `command="close"`. No `role="dialog"`, `aria-modal`, focus trap or scroll lock: the
  browser does all of it. Use `command="request-close"` and a `cancel` handler for unsaved changes.
- Menus and popovers anchor to their invoker where CSS anchor positioning exists, and flip at screen edges. Elsewhere
  the browser centres them.
- Tooltips show on hover and focus where `interestfor` exists. Never put needed information only in a tooltip: an
  icon button still has its `aria-label`.
- Toasts are for supplemental news. Never show one during a modal (`toast()` waits), and keep their actions
  available elsewhere.

## Utilities

`x-visually-hidden`, `x-tabular` (tabular numbers), `x-mono`, `x-muted`, `x-truncate`, `x-display` (hero size),
`x-flip-rtl` (directional icons), `x-tile` (the brand tile), `x-surface`, `x-raised`, `x-reveal` (rises in on scroll),
`x-pressable`, `x-enter` and `x-stagger` (see motion), and:

| Utility | Use |
| --- | --- |
| `x-touch-target` | A small control (an icon in a dense row) gets a 44 px hit area on touch screens. Needs a positioned box |
| `x-lazy` | An item of a long list, rendered only near the screen. Set `--x-lazy-size` to its usual height |
| `x-readable` | A colour someone else chose (a chat name, a label): set `--x-color`, it stays legible in both themes |
| `x-scrollbar-none`, `x-scrollbar-stable` | Hide a scrollbar (the box still scrolls), or keep its room so content never shifts |

Scrollbars are styled everywhere: a rounded thumb of `--x-scrollbar-thumb` (the control edge, 3:1 on every surface,
the text colour under `prefers-contrast: more`) on `--x-scrollbar-track`, thickening under the pointer. Set those two
on a box to change its scrollbar; never transition them. Do not set `scrollbar-width` or `scrollbar-color` in app
code (except `none` through `x-scrollbar-none`): in Chromium they switch off the styled scrollbar and bring back the
arrow buttons Windows draws.
