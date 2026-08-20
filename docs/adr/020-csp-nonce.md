# 020 — Inline scripts are authorised by nonce, not by hash

**Status:** accepted, 2026-08-20. Implements the CSP of
[05 — Deployment and security §3](../plan/05-deploy-security.md).

## Context

The policy allows no inline script, and the application ships three: the theme
bootstrap that prevents a flash of the wrong theme, and two TanStack snippets
for scroll restoration and hydration. Under `script-src 'self'` all three are
blocked, the application never hydrates, and the page renders as static markup
with a broken title — observed, not predicted, once the policy was actually
enforced against the running build rather than merely sent as a header.

Hashes were tried first and do not work: the hydration snippet carries
per-request state, so its content differs between loads and no fixed hash
authorises it. `'unsafe-inline'` would work and would give away most of what
the policy exists for.

A third failure appeared along the way: React re-creates the elements it
manages inside `head`, and a re-created inline script loses the nonce the
server stamped on it. That one is invisible in development and fatal in
production.

## Decision

- The build stamps `nonce="{{placeholder \`http.request.uuid\`}}"` onto every
  inline script tag, and writes a Caddy snippet whose `script-src` names the
  same placeholder. Caddy's `templates` directive substitutes a fresh value per
  request into both, so header and body always agree.
- The theme bootstrap moved out of `head.scripts` into a real file at
  `/theme.js`, because React would otherwise re-create it without its nonce.
  The cost is one small blocking request from the same origin.
- The end-to-end suite runs against a static server that reproduces what Caddy
  does — not `vite preview`, which rewrites HTML on the fly and thereby hides
  whether the real policy works.

## Consequences

- No inline script is authorised as a class; each one is authorised per
  request.
- A script the build fails to stamp is blocked in production and nowhere else,
  so a test asserts that every inline script tag in the output carries the
  placeholder.
- The policy is exercised on all six routes, and the page must be functional
  under it rather than merely load without a console error.
