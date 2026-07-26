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

### SP-5: JS click toggle + localStorage persistence
**Status:** To Do
**Description:** Click handler toggles `.visited` and persists region ids to
`scratchpass:visited:v1`; state re-applies on load.
**Acceptance criteria:**
- [ ] Click toggles class and updates the localStorage array
- [ ] Refresh restores visited state from localStorage
- [ ] No npm packages or build step introduced
- [ ] Regions are keyboard-focusable (`tabindex="0"`) and toggle on
      Enter/Space — `.region:focus-visible` CSS from SP-4 is already in
      place and waiting on this

### SP-6: Mobile pass
**Status:** To Do
**Description:** Verify and adjust the map for mobile viewports.
**Acceptance criteria:**
- [ ] Viewport meta tag present
- [ ] `touch-action: manipulation` set
- [ ] Tap targets usable at common mobile widths
- [ ] No horizontal overflow at common mobile widths

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

### SP-13: Subdivision maps *(Later)*
**Status:** To Do
**Description:** Drill-down maps using `COUNTRY:SUBREGION` ids (e.g. `IT:TO`
for Tuscany), per the locked id scheme.
**Acceptance criteria:**
- [ ] At least one country's subdivision map implemented
- [ ] Ids follow `CC:SUBDIV` format; existing country-level entries unaffected
