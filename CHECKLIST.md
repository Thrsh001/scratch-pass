# Scratch Pass — Project Checklist

Ticket-style breakdown of the build, grouped by epic. Statuses: `To Do` /
`In Progress` / `Done`. Update this file as work lands — it's the
authoritative task list; `HANDOFF.md` (session-to-session notes) and the
plan doc's `todos:` frontmatter should stay consistent with it, not diverge.

---

## Epic 1 — Phase 1: Visual MVP

### SP-1: Scaffold Django project
**Status:** Done
**Description:** Create `config` project + `maps` app; wire settings, urls,
templates, and static dirs per `CLAUDE.md` conventions.
**Acceptance criteria:**
- [x] `config` project + `maps` app created
- [x] `maps` registered in `INSTALLED_APPS`
- [x] `STATICFILES_DIRS` wired to project-level `static/`
- [x] `config.urls` includes `maps.urls` at `""`
- [x] `requirements.txt`, `.gitignore`, `README.md` created

### SP-2: Map view + placeholder SVG
**Status:** Done
**Description:** `map_view` renders `map.html` with a couple of placeholder
region paths to prove the URL → view → template → static chain end to end.
**Acceptance criteria:**
- [x] `maps.views.map_view` renders `maps/map.html`
- [x] Template includes an SVG with ≥2 `<path class="region" data-region="…">`
- [x] `/` returns 200; `static/css/map.css` and `static/js/map.js` resolve

### SP-3: Full world SVG map asset
**Status:** Done
**Description:** Replace the placeholder paths with a simplified world map
(public-domain / Natural Earth–derived), one `<path>` per country.
**Acceptance criteria:**
- [x] Countries represented as individual `<path>` elements (175 countries,
      Natural Earth 1:110m Admin 0, converted via a one-off equirectangular
      projection script — not part of the shipped app, no runtime build step)
- [x] No nested `<g>` wrapping that breaks click hit-testing
- [x] Each path's `id` matches its `data-region` (ISO 3166-1 alpha-2; Taiwan
      normalized from Natural Earth's `CN-TW` to standard `TW`; N. Cyprus and
      Somaliland omitted — no ISO 3166-1 alpha-2 code exists for either)

**Known gap (found 2026-08-01, deferred to SP-13):** Natural Earth's 1:110m
resolution omits small entities entirely rather than just simplifying their
shape — confirmed by diffing against the 50m/10m datasets. 62 ISO 3166-1
entities are missing from the current map, including 28 UN member states
(Andorra, Monaco, Vatican City, San Marino, Singapore, Malta, Liechtenstein,
Bahrain, Barbados, Cabo Verde, Comoros, Dominica, Grenada, Kiribati,
Maldives, Marshall Is., Mauritius, Micronesia, Nauru, Palau, Saint Lucia,
Samoa, São Tomé and Príncipe, Seychelles, St. Kitts and Nevis, St. Vincent
and the Grenadines, Tonga, Tuvalu, Antigua and Barb.) plus ~34 dependent
territories with their own ISO codes (Hong Kong, Bermuda, Gibraltar, Cayman
Is., Guam, French Polynesia, etc.). User decision: keep the current 175 as
they are for now; fold the missing entities in as part of SP-13 rather than
patching SP-3 separately. SP-13's scope note below has been updated to
reflect this.

Implementation note: markup lives in
`maps/templates/maps/partials/world.svg` and is pulled into `map.html` via
`{% include %}`, per the plan's guidance for a large inline SVG.

### SP-4: CSS visual polish
**Status:** Done
**Description:** Cohesive visited-state color, hover/focus-visible feedback,
smooth transitions, reduced-motion support, branded layout/typography.
**Acceptance criteria:**
- [x] `.region.visited` fill color set (`#2a9d8f` teal on `#d4d8de` neutral)
- [x] Hover/focus-visible scale + brightness feedback
- [x] Transitions limited to `fill`/`transform`/`filter`
- [x] `prefers-reduced-motion: reduce` respected
- [x] "Scratch Pass" branding/typography in place (card layout, system font
      stack, tagline) — no default purple AI theme

Implementation note: `.region:focus-visible` styling is in place but inert
until SP-5 adds `tabindex` to the SVG paths (paths aren't keyboard-focusable
yet) — flagged there, not a gap in this ticket.

### SP-4.1: Map zoom & pan
**Status:** Done
**Description:** Scroll-wheel/pinch zoom toward the cursor or touch
midpoint, single-pointer drag to pan, double-click/double-tap to reset —
via `viewBox` manipulation, no dependencies. Refinement requested outside
the original SP-1..13 scope; numbered as a sub-ticket of SP-4 since it's
map-polish work.
**Acceptance criteria:**
- [x] Wheel zoom, centered on cursor position
- [x] Pinch zoom (two-pointer), centered on touch midpoint
- [x] Single-pointer drag pans the view
- [x] Double-click/double-tap resets to the full-world view
- [x] Zoom/pan clamped so the view can't go past the map edges or exceed a
      max zoom-in
- [x] No new dependencies (native Pointer Events API + `viewBox` only)

Implementation notes:
- `touch-action` on `.world-map` changed from `manipulation` to `none` so
  the browser's native gesture handling doesn't fight the custom pinch/pan
  — supersedes the `touch-action: manipulation` acceptance criterion
  written for SP-6; SP-6 should verify `none` still gives an acceptable
  mobile experience rather than re-adding `manipulation`.
- SP-5's future click-to-toggle handler must check pointer movement
  distance before treating a `pointerup` as a tap, so panning doesn't also
  toggle the region the drag started on — noted in `map.js`.

### SP-4.2: Full-bleed layout
**Status:** Done
**Description:** Rework the centered card layout (max-width 960px) into a
full-viewport map, giving the SP-4.1 zoom/pan the most room to work with.
**Acceptance criteria:**
- [x] `.map-shell` fills the viewport (`100vw` / `100dvh`)
- [x] SVG fills `.map-shell` (`width`/`height: 100%`)
- [x] Title/tagline moved into a floating `.map-overlay` card (top-left,
      `pointer-events: none` so it doesn't block map interaction underneath)
- [x] `html, body` set to `overflow: hidden` since the map is the whole page

### SP-5: JS click toggle + localStorage persistence
**Status:** Done
**Description:** Click handler toggles `.visited` and persists region ids to
`scratchpass:visited:v1`; state re-applies on load.
**Acceptance criteria:**
- [x] Click toggles class and updates the localStorage array
- [x] Refresh restores visited state from localStorage
- [x] No npm packages or build step introduced
- [x] Click handling distinguishes a tap from a pan (see SP-4.1 note) so
      dragging the map doesn't also toggle a region
- [x] Regions are keyboard-focusable (`tabindex="0"`) and toggle on
      Enter/Space — `.region:focus-visible` CSS from SP-4 is now fully
      functional

Verified end-to-end with a real headless-Chrome session (puppeteer-core,
dev-only, not a project dependency): click toggles class/`aria-pressed`/
localStorage both ways, state survives reload, `Tab` + `Enter` toggles via
keyboard, and an 80px drag starting on a region does not toggle it.
`aria-pressed` was added alongside `tabindex`/`role="button"` (in
`world.svg`) for full toggle-button semantics, not just visual/keyboard
access.

**Fix:** a mouse click left a rectangular focus ring around the clicked
region's bounding box (visible once the cursor moved off it) — a Chromium
quirk where the default focus indicator on a focusable SVG shape isn't
fully governed by `outline` the way it is on HTML elements, even though
`getComputedStyle` reported `outline: none`. Confirmed via screenshot +
`.blur()` diffing that it was genuinely focus-related. Fixed by moving
`outline: none` onto the base `.region` rule (unconditional, not scoped to
`:focus-visible`) in `static/css/map.css`. Re-verified: mouse click no
longer shows a ring, and `Tab`-driven keyboard focus still shows the
intended stroke-based indicator.

### SP-6: Mobile pass
**Status:** Done
**Description:** Verify and adjust the map for mobile viewports.
**Acceptance criteria:**
- [x] Viewport meta tag present (`map.html`, already in place since SP-1/2)
- [x] `touch-action` set appropriately — kept as `none` (not `manipulation`),
      per the SP-4.1 decision, since the custom pinch/pan needs full control
      of touch gestures. Verified no unwanted native browser gesture
      interference and no horizontal overflow at 360/375/390px widths.
- [x] Tap targets usable at common mobile widths
- [x] No horizontal overflow at common mobile widths (checked 360×740,
      375×667, 390×844 — `scrollWidth === clientWidth` at all three)

Verified with a real headless-Chrome session (puppeteer-core, dev-only, not
a project dependency) at the three viewports above.

**Finding:** at the original 16x max zoom (`MIN_WIDTH = FULL.width / 16`),
the smallest countries (Luxembourg, Trinidad & Tobago, etc.) rendered at
~9×11px even fully zoomed in — well under the ~24px touch-target minimum
(WCAG 2.5.8 AA) and not practically tappable on a touchscreen. Two fixes:
- `static/js/map.js`: raised max zoom-in from 16x to 40x
  (`MIN_WIDTH = FULL.width / 40`). At 40x, Luxembourg (the smallest region
  in the map) reaches ~24×28px on a 375px-wide viewport, the narrowest
  tested — the practical floor for this 175-country map without adding
  per-region hit-area overrides, which is out of scope here.
- `static/css/map.css`: added `vector-effect: non-scaling-stroke` to
  `.region` — at the deeper zoom, the fixed-width stroke was scaling up
  with the viewBox and visually swallowing tiny countries; this keeps the
  border a constant screen-pixel width across the whole zoom range.

Regression-checked click-toggle, keyboard-toggle (Enter), localStorage
persistence across reload, drag-pan not toggling the region it starts on,
and double-click reset — all still behave correctly after these changes.

Full zoom-out tap precision for micro-nations remains inherently limited
(true on desktop too, not mobile-specific) — mitigated, not eliminated, by
the zoom affordance from SP-4.1.

---

## Epic 2 — Phase 2: Accounts & Persistence

### SP-7: UserProfile model stub
**Status:** To Do
**Description:** Add `UserProfile` (`OneToOneField` to `User`,
`visited_regions` JSONField, default `list`), registered in admin. No API
endpoints yet — stub only, per plan section 3/5.
**Acceptance criteria:**
- [ ] Model created + migration generated and applied
- [ ] Registered in `maps/admin.py`
- [ ] No views/endpoints added in this ticket

### SP-8: Document the Phase 2 swap point in JS
**Status:** To Do
**Description:** Comment block in `map.js` documenting how localStorage
writes will become a `POST /api/me/visits/toggle/` call with CSRF.
**Acceptance criteria:**
- [ ] Comment present near the toggle logic, describing the future fetch call

### SP-9: Auth flow *(Later)*
**Status:** To Do
**Description:** Wire Django auth (login/logout) so a user can have an
authenticated session.
**Acceptance criteria:**
- [ ] Login/logout views wired
- [ ] `UserProfile` created on user signup (signal or `get_or_create`)

### SP-10: Toggle API endpoint *(Later)*
**Status:** To Do
**Description:** `POST /api/me/visits/toggle/` — CSRF-protected, validates
the submitted region id, returns the full updated `visited` list.
**Acceptance criteria:**
- [ ] Endpoint validates region id format before storing
- [ ] CSRF enforced
- [ ] Response returns updated list; response shape matches `GET` (SP-11)

### SP-11: Get-visits API endpoint *(Later)*
**Status:** To Do
**Description:** `GET /api/me/visits/` — hydrates the map with the logged-in
user's `visited_regions` on load.
**Acceptance criteria:**
- [ ] Returns the current user's visited list only (authz enforced)

### SP-12: Guest-to-login merge *(Later)*
**Status:** To Do
**Description:** On first login, reconcile existing `localStorage` state
with server state via a union merge rather than overwriting either side.
**Acceptance criteria:**
- [ ] Merge is a union (no data loss on either side)
- [ ] `localStorage` resynced from the server response after merge

### SP-13: Subdivision maps + missing-entity pass *(Later)*
**Status:** To Do
**Description:** Drill-down maps using `COUNTRY:SUBREGION` ids (e.g. `IT:TO`
for Tuscany), per the locked id scheme. Scope expanded (2026-08-01, user
decision) to also add the 62 ISO 3166-1 entities missing from the current
top-level map — see the "Known gap" note under SP-3 for the full list and
root cause (Natural Earth 1:110m omits them entirely, not just simplifies
them; 50m/10m have them). Source those from the 50m or 10m dataset and
reproject into the existing 1000×500 equirectangular `viewBox` without
disturbing the current 175 paths' geometry.
**Acceptance criteria:**
- [ ] At least one country's subdivision map implemented
- [ ] The 62 missing entities (28 UN member states + ~34 territories, listed
      under SP-3) added to the top-level world map as individual `<path>`s,
      consistent with the existing projection/style
- [ ] Ids follow `CC:SUBDIV` format; existing country-level entries unaffected
