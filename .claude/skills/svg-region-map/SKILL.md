---
name: svg-region-map
description: Use when adding, editing, or debugging clickable regions in the SVG map (map.html) — path structure, data-region ids, and hit-testing.
---

# SVG Region Map Editing

- Every clickable unit is a single `<path>` with `class="region"` and a
  `data-region` attribute — never wrap it in a `<g>` that would intercept
  clicks before they reach the path (breaks `e.target.closest(".region")`
  hit-testing in `map.js`).
- `data-region` value follows the locked id scheme: ISO 3166-1 alpha-2 for
  country-level paths now (`"IT"`), `COUNTRY:SUBREGION` for subdivision paths
  later (`"IT:TO"`) — see `CLAUDE.md` for the full scheme.
- Keep `id="<code>"` on the path in sync with `data-region` when both are
  present; don't let them diverge.
- New paths must inherit `.region` CSS (fill/stroke/transition) automatically
  — don't add per-path inline styles.
- When adding a country/subdivision:
  1. Add the `<path>` with correct `d`, `id`, `data-region`.
  2. Verify it's clickable and toggles `.visited` in the browser.
  3. Verify it survives a refresh (localStorage round-trip).
  4. Confirm it doesn't overlap/steal clicks from a neighboring path.
- Prefer a simplified, public-domain (e.g. Natural Earth–derived) path over a
  high-vertex-count original — this app doesn't need cartographic precision,
  it needs fast, reliable hit-testing.
