# 019 — The SPA shell is its own route

**Status:** accepted, 2026-08-20. Implements D1.

## Context

D1 requires both a `_shell.html` serving the five editors and a complete HTML
page per marketing route. In TanStack Start, `spa.maskPath` defaults to `/`,
which makes the home page *be* the shell: the prerender writes the empty frame
over `index.html` and the SEO the decision exists for is lost. This was observed
in a real build, not inferred.

## Decision

`spa.maskPath` points at `/app`, backed by `src/routes/app.tsx` — a route that
renders only a loading indicator and carries `noindex`. The root-level
`prerender` block, with `crawlLinks` on and `/tools/*` filtered out, renders the
marketing routes to real HTML.

The build therefore emits `dist/client/index.html` with the full home page markup
and `dist/client/_shell.html` with the frame, which is exactly the shape
described in the deployment document.

## Consequences

- Caddy serves prerendered files as they are and only falls through to
  `_shell.html` for genuinely unknown paths. A rewrite rule that caught
  everything would undo this.
- Editors are excluded from the prerender on purpose: prerendering a client-only
  route would ship an empty frame with nothing to index.
- The CI asserts that both files exist after a build, so a config change cannot
  silently collapse them back into one.
