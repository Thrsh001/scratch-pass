---
name: performance-optimization
description: Use when investigating performance in Scratch Pass — SVG render cost, CSS transition cost, and (Phase 2) DB query cost.
---

# Performance Review

Look for:
- Expensive DOM queries in `map.js` (e.g. re-querying all `.region` nodes
  more than needed on click/load).
- CSS transitions/animations on properties other than `fill`/`transform`
  (layout-triggering properties cause jank on the ~200-path SVG).
- SVG path complexity/file size.
- Database queries (Phase 2: N+1 on `UserProfile`/`visited_regions` reads).
- Network requests (Phase 2: toggle endpoint should be a single round trip).

There is no JS bundle in this project (no build step) — bundle-size analysis
does not apply.

Rank findings by impact.
