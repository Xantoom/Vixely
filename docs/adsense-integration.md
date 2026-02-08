# Google AdSense Integration Guide

## Overview

Vixely uses Google AdSense for non-intrusive ad monetization. Ads never overlay the workspace and are placed in sidebar/footer positions only.

## Setup

### 1. Script Loading

The AdSense bootstrap script is loaded in `index.html`:

```html
<script
  async
  src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX"
  crossorigin="anonymous"
></script>
```

Replace `ca-pub-XXXXXXXXXXXXXXXX` with your actual publisher ID.

### 2. ads.txt

Place `ads.txt` in the root of your deployed domain (e.g., `https://vixely.app/ads.txt`):

```
google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
```

For Railway deployments, serve this via a static file route or place it in `public/ads.txt`.

### 3. Ad Slot IDs

Configure slot IDs in the ad components:

| Placement          | Component        | Slot Format     | Size          |
|--------------------|------------------|-----------------|---------------|
| Homepage footer    | `AdContainer`    | `footer-banner` | 728x90        |
| Homepage rectangle | `AdSlot`         | `square`        | 300x250       |
| Editor sidebar     | `AdContainer`    | `sidebar-ad`    | 300x250       |

## Placement Strategy

- **Homepage:** Leaderboard (728x90) at the footer, medium rectangle (300x250) between sections
- **Editor pages:** Below sidebar controls, never overlapping workspace
- **Never:** Inside toolbars, over the canvas/video player, or blocking interactions

## Ad Components

### `AdContainer` (`src/components/AdContainer.tsx`)

Renders a real `<ins class="adsbygoogle">` tag with fallback to a placeholder when ads fail to load.

### `AdSlot` (`src/components/AdSlot.tsx`)

Variant-based ad component (footer banner or square rectangle) with dismiss capability.

### `useAdBlockDetector` (`src/hooks/useAdBlockDetector.ts`)

Detects adblockers by checking if the AdSense script loaded. When blocked:
- Ad containers gracefully collapse (zero height)
- No nagging banners or popups are shown
- App functionality is unaffected

## Adblocker Handling

The hook checks `window.adsbygoogle` existence after a timeout. If absent, `isBlocked` returns `true` and ad containers render nothing. This is intentional — Vixely respects user choice.

## Testing

1. **With ads:** Verify ads render in correct positions, never overlay workspace
2. **With adblocker:** Verify graceful collapse, no console errors, no broken layout
3. **Mobile:** Verify ads respect responsive breakpoints (hidden on small screens)
