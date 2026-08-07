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

### SP-4.3: Remove hover scale pop
**Status:** Done
**Description:** `.region:hover` scaled up (`transform: scale(1.03)`)
alongside the brightness dim from SP-4 — user found the "pop" distracting
and asked to keep only the color/brightness change on hover. Numbered as
a further SP-4 sub-ticket (same pattern as SP-4.1/SP-4.2); split out of
the SP-9.1 conversation since it's an unrelated map-CSS tweak, not part
of the auth work (2026-08-06).
**Acceptance criteria:**
- [x] `.region:hover` no longer scales; brightness dim on hover unchanged
- [x] `.region:focus-visible` keeps its scale — not part of this ask, and
      it's a distinct keyboard-focus affordance separate from the
      stroke-based indicator already in place

Implementation note: split the combined `.region:hover, .region:focus-
visible` rule so `:hover` only sets `filter: brightness(0.96)` and
`:focus-visible` keeps both `transform: scale(1.03)` and the brightness
dim. Verified via a real headless-Chrome session: computed `transform` on
a region stays `none` during a real `hover()`, `filter` still dims.

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
**Status:** Done
**Description:** Add `UserProfile` (`OneToOneField` to `User`,
`visited_regions` JSONField, default `list`), registered in admin. No API
endpoints yet — stub only, per plan section 3/5.
**Acceptance criteria:**
- [x] Model created + migration generated and applied
- [x] Registered in `maps/admin.py`
- [x] No views/endpoints added in this ticket

### SP-8: Document the Phase 2 swap point in JS
**Status:** Done
**Description:** Comment block in `map.js` documenting how localStorage
writes will become a `POST /api/me/visits/toggle/` call with CSRF.
**Acceptance criteria:**
- [x] Comment present near the toggle logic, describing the future fetch call

### SP-9: Auth flow
**Status:** Done
**Description:** Wire Django auth (login/logout/register) so a user can
create an account and have an authenticated session. Scope expanded
2026-08-06 (user decision) to include a registration form/view for new
users, not just login/logout — pulled forward ahead of SP-10/SP-11 per
user request.
**Acceptance criteria:**
- [x] Login/logout views wired
- [x] Registration view + form for new users, auto-logs in on success
- [x] `UserProfile` created on user signup (signal, so it covers
      admin-created users too, not just self-registration)

Implementation notes:
- `maps/signals.py`: `post_save` receiver on `AUTH_USER_MODEL` creates the
  `UserProfile` via `get_or_create` for *any* user creation path (self
  registration, `createsuperuser`, admin-created users) — wired in
  `MapsConfig.ready()`, not tied to the register view.
- `maps/views.register_view` uses `django.contrib.auth.forms
  .UserCreationForm` (no new dependency) and logs the user in immediately
  on success, redirecting to the map.
- Login/logout use Django's built-in `LoginView`/`LogoutView`; logout is a
  POST-only form (CSRF-protected) rather than a GET link, per current
  Django auth-view guidance.
- Templates (`maps/templates/maps/login.html`, `register.html`) follow the
  app-namespace convention; `map.html`'s overlay header gained an
  `.auth-nav` (login/register links, or username + logout when
  authenticated) — `pointer-events: auto` re-enabled locally since the
  overlay itself is `pointer-events: none`.
- Existing `UserProfileTests` updated: they previously called
  `UserProfile.objects.create(user=user)` after `create_user`, which now
  conflicts with the auto-create signal (`OneToOneField` uniqueness) — now
  read `user.profile` instead, plus new tests for the signal itself,
  registration, login, and logout.
- Verified end-to-end with a real headless-Chrome session (puppeteer-core,
  dev-only, not a project dependency): register → auto-login → map shows
  username + logout, logout clears session, re-login with the same
  credentials works, and a bad-password attempt shows the expected error.

### SP-9.1: Auth section refinement
**Status:** Done
**Description:** Fix + redesign the login/register UI from SP-9. Bug: the
floating `.map-overlay`'s Login/Register/Logout controls aren't reliably
clickable on the map view. Numbered as a sub-ticket of SP-9 (same pattern
as SP-4.1/SP-4.2), inserted ahead of SP-10 per user request (2026-08-06).
Decisions made with the user before starting:
- Google/Facebook buttons are **UI placeholders only** this ticket (no
  `django-allauth`/new dependency, no OAuth wiring) — same spirit as the
  "logo to be replaced later" placeholder. Real OAuth is a future ticket.
- Login and register become **one page** with a tab switch between them
  (CSS-only via radio inputs, no JS needed), not two separate pages.
- Mid-ticket revision (2026-08-06, user feedback on first pass): the plain
  single-column card looked bare — reworked into a two-panel page (a
  decorative teal/dark hero panel with a globe motif + tagline on the
  left, the card on the right; hero hidden under 860px, card alone fills
  the page on mobile).
- Mid-ticket scope addition (2026-08-06, user request): **`/` (the map)
  now requires an authenticated session** — anonymous visitors are
  redirected to `/login/?next=/` via `@login_required`. This supersedes
  SP-9.1's original "logged-out top bar" criterion (the map's top bar no
  longer has a logged-out state — it can't render for anonymous users)
  and **narrows Phase 1's original guest/localStorage-only design** — flag
  for SP-12 ("guest-to-login merge"), which assumed anonymous
  `localStorage` use was still possible; that ticket's premise may need
  revisiting or explicit re-confirmation before it's picked up.
**Acceptance criteria:**
- [x] Combined login/register template (`maps/account.html`) with a
      world-map logo placeholder and a CSS-only tab switch between the two
      forms; `login`/`register` URLs both render it with the right tab
      active and their own form's errors
- [x] "Continue with Google" / "Continue with Facebook" buttons present on
      both tabs, visibly disabled/non-functional (no dependency added)
- [x] Map view's floating overlay replaced with a persistent top bar that
      reduces the map's height (not an absolutely-positioned overlay on
      top of it) — fixes the click-through bug structurally
- [x] Logged-in top bar: username on the left, visited-country count in
      the center (client-side from localStorage, consistent with Phase 1
      — no API yet), logout on the right
- [x] `/` requires an authenticated session; anonymous visitors redirect to
      `/login/?next=/` (supersedes the original "logged-out top bar"
      criterion — see scope-addition note above)
- [x] Regression-checked: click-toggle, keyboard-toggle, zoom/pan, and
      localStorage persistence from SP-4.1–SP-6 still work with the
      resized map viewport

Implementation notes:
- `maps/views.py`: `register_view` and a new `LoginView` (subclasses
  Django's `LoginView`, overrides `get_context_data` to add `active_tab`
  and the *other* form) both render the same `maps/account.html`; old
  per-page `login.html`/`register.html` deleted as dead code.
- `maps/templates/maps/account.html`: CSS-only tab switch via two
  visually-hidden-but-focusable radio inputs + the general sibling
  combinator — no JS. Social buttons are `disabled` with a "Coming soon"
  title, per the UI-placeholder-only decision.
- **CSS specificity bug found + fixed during verification:** the hidden
  tab radios (`.auth-tab-input`, meant to collapse to 1px) were losing to
  `.auth-card input { width: 100% }` — same specificity, later in the
  cascade — which stretched them to full card width and caused ~45px of
  horizontal overflow on mobile only (didn't show on desktop, where the
  extra width fit). Fixed by qualifying the selector to
  `.auth-card input.auth-tab-input` to unambiguously outrank it.
- `static/css/map.css` + `map.html`: `.map-shell` is now `flex-direction:
  column` with a `.top-bar` (fixed height) + `.world-map` (`flex: 1 1
  auto`) instead of the old absolutely-positioned `.map-overlay` —
  structural fix for the reported click-through bug, not just a z-index
  tweak.
- `static/js/map.js`: `updateVisitedCount()` writes to a
  `[data-visited-count]` element (only present when logged in), called
  from both `applyVisited()` (page load) and `toggleRegion()`.
- Verified end-to-end with a real headless-Chrome session (puppeteer-core,
  dev-only): real mouse click on the top bar's Login link, CSS-tab switch
  via label click, register → top bar shows username + count + logout,
  clicking a region live-updates the count, logout/re-login work via real
  clicks (not just `page.goto`), 375px mobile has no horizontal overflow.
  Full SP-4.1–SP-6 regression pass: keyboard toggle + reload persistence
  + wheel zoom + drag pan + double-click reset (confirmed via direct event
  dispatch after Puppeteer's synthetic `dblclick` proved unreliable in
  headless — not an app bug) all still work with the resized viewport.
- **Revision pass (post-user-review):** `account.html` reworked into
  `.auth-shell` (CSS grid, two columns) — `.auth-hero` (decorative
  gradient + inline SVG globe motif + tagline, `display: none` under
  860px) and `.auth-card-wrap` (the existing card, now with refined input
  focus rings, submit-button hover state, and small colored letter badges
  on the social buttons). `maps/views.map_view` gained `@login_required`;
  `LOGOUT_REDIRECT_URL` changed from `'map'` to `'login'` in
  `config/settings.py` since routing a logged-out user through `map` now
  just triggers a second redirect anyway. `map.html`'s top bar simplified
  to drop its now-unreachable logged-out branch (username/count/logout
  always render, since the view guarantees authentication). Re-verified
  with the same puppeteer flow plus an explicit anonymous-GET-`/`-redirect
  check; full Django suite (13 tests) still green.
- **Final polish pass (user review):** removed the now-pointless "Back to
  map" link from `account.html` (map requires login, so it just looped an
  anonymous visitor back to `/login/`) and its now-unused `.auth-switch`
  CSS. Sized down Django's password-requirements help text — found it's
  rendered as `<span class="helptext"><ul>...</ul></span>` in Django's
  source HTML, but browsers can't nest a `<ul>` inside the `<p>` that
  wraps the field, so the parser ejects it to become a sibling of the
  `<p>` instead of a descendant of `.helptext` — targeted
  `.auth-card form ul/li` directly rather than `.helptext ul/li`, which
  matched nothing. Styled Django's per-field `.errorlist` (previously
  unstyled — plain black bullets) red and slightly larger, and bumped the
  "Please fix the errors below" summary to bold/1rem so real validation
  errors read clearly distinct from the neutral gray help text above them.

### SP-10: Toggle API endpoint
**Status:** Done
**Description:** `POST /api/me/visits/toggle/` — CSRF-protected, validates
the submitted region id, returns the full updated `visited` list.
**Acceptance criteria:**
- [x] Endpoint validates region id format before storing
- [x] CSRF enforced
- [x] Response returns updated list; response shape matches `GET` (SP-11)
      — `{"visited": [...]}`, both endpoints will share it

Implementation notes:
- `maps/regions.py`: `valid_region_ids()` — the allowlist is sourced
  directly from `world.svg`'s `data-region` attributes (regex + cached
  with `lru_cache`) rather than a hand-maintained duplicate list, so it
  can't drift out of sync with the map and automatically picks up SP-13's
  future additions.
- `maps/models.py`: persistence logic lives in
  `UserProfile.toggle_region()`, not the view, per CLAUDE.md. Wrapped in
  `transaction.atomic()` with `select_for_update()` — a toggle is a
  read-modify-write, so without the row lock two rapid requests (double-
  click, multi-tab) could race and clobber each other's result. This is a
  no-op on SQLite (dev) but becomes real row locking once SP-14 switches
  to Postgres.
- `maps/views.py`: `toggle_visit` returns a clean `401` JSON body for
  unauthenticated requests rather than `@login_required`'s HTML redirect,
  since this is a JSON API, not a page. `@require_POST` for the method
  check; CSRF is enforced by the existing global `CsrfViewMiddleware` (no
  `@csrf_exempt`) — the cookie is already set on every map page load via
  the logout form's `{% csrf_token %}`.
- Verified end-to-end with a real headless-Chrome session (puppeteer-core,
  dev-only): real `fetch()` with the `X-CSRFToken` header read from
  `document.cookie` — toggle adds/removes correctly, a request missing the
  CSRF header gets `403`, an unknown region id (`"ZZ"`) gets `400` and
  isn't stored. 25 Django tests total (8 new), all green, including
  `Client(enforce_csrf_checks=True)` to confirm CSRF is genuinely enforced
  and not silently bypassed by the test client's default.
- Frontend JS is intentionally **not** wired to this endpoint yet — SP-10's
  scope is the backend endpoint only; `map.js` stays localStorage-only
  until SP-11 (GET endpoint) also exists, per the SP-8 comment.

### SP-11: Get-visits API endpoint
**Status:** Done
**Description:** `GET /api/me/visits/` — hydrates the map with the logged-in
user's `visited_regions` on load. Scope expanded (2026-08-07, user
decision) to also wire the frontend to both this and SP-10's endpoint —
`map.js` now actually calls them, per the plan doc's step 1-3 flow —
rather than leaving that as a separate follow-up ticket.
**Acceptance criteria:**
- [x] Returns the current user's visited list only (authz enforced)
- [x] `map.js` calls `GET /api/me/visits/` on load to hydrate state
      (server is the source of truth; `localStorage` is now an offline
      cache/fallback, not authoritative)
- [x] `map.js` calls `POST /api/me/visits/toggle/` on each click/keyboard
      toggle (optimistic UI, rolls back on a failed request)

Implementation notes:
- `maps/views.get_visits`: same auth/response-shape pattern as
  `toggle_visit` — clean `401` JSON for anonymous requests, `@require_GET`,
  returns `{"visited": [...]}`.
- `static/js/map.js`: `setVisited()` is the single place that updates
  `visited`, `localStorage`, and the DOM together, used by initial
  hydration, toggle's optimistic update, the server's confirmation
  response, and the failure-rollback path — avoids the four call sites
  drifting out of sync with each other.
- Deliberately does a **replace**, not a union merge, on hydration — the
  map has required login since SP-9.1, so there's no meaningful guest
  `localStorage` state left to preserve by the time this runs (SP-12's
  merge ticket predates that change and may need revisiting, per the note
  under SP-9.1).
- Verified end-to-end with a real headless-Chrome session (puppeteer-core,
  dev-only): confirmed the actual network calls fire (`GET` on load,
  `POST` on toggle) via Puppeteer's request listener, not just the
  resulting UI state. Proved hydration is genuinely server-backed (not
  just re-reading `localStorage`) by clearing `localStorage`, reloading,
  and confirming the visited region + count still render correctly from
  the server, with `localStorage` then resynced. Regression-checked
  keyboard toggle and zoom/pan still work. 29 Django tests unaffected
  (this ticket only added backend tests for `get_visits`; the frontend
  wiring has no Python-side test surface).

### SP-12: Guest-to-login merge
**Status:** Removed (2026-08-07) — superseded by SP-9.1/SP-11
**Description (original):** On first login, reconcile existing
`localStorage` state with server state via a union merge rather than
overwriting either side.
**Why removed:** This ticket assumed an anonymous/guest phase where
`localStorage` could accumulate visited regions before an account existed,
needing reconciliation on first login. That phase no longer exists —
SP-9.1 made the map require login before any toggle can happen, and SP-11
made every toggle sync to the server immediately (optimistic UI, rolls
back on failure). `localStorage` is now always a mirror/fallback of
server state, never a source of local-only data the server doesn't have,
so there is nothing left to merge. Confirmed with the user before removal.

### SP-13: Subdivision maps + missing-entity pass
**Status:** Split into SP-13.1 + SP-13.2 (2026-08-07, planning decision)
**Description:** Originally bundled two very differently-sized pieces of
work — adding the 62 missing top-level entities (data-only, low risk) and
building the first `COUNTRY:SUBREGION` drill-down map (new UI pattern,
higher risk). Split so the smaller, lower-risk half ships and gets
reviewed before the bigger one starts, same pattern as the SP-4.x/SP-9.x
sub-tickets. See `/home/thrsh/.claude/plans/wiggly-dancing-fog.md` for the
full researched plan (data sources, projection formulas, verified ISO
codes) behind both sub-tickets.

### SP-13.1: Missing-entity pass
**Status:** Done
**Description:** Add the 62 ISO 3166-1 entities missing from the top-level
map — see the "Known gap" note under SP-3 for the full list and root cause
(Natural Earth 1:110m omits them entirely, not just simplifies them; 50m
has them). Sourced from `ne_50m_admin_0_countries.geojson`
(nvkelso/natural-earth-vector — same public-domain lineage as SP-3),
reprojected with the exact same equirectangular formula already in use
(`x=(lon+180)*(1000/360)`, `y=(90-lat)*(500/180)`, reverse-engineered and
confirmed against existing IT/FR paths) and appended — not interleaved —
so the original 175 paths' geometry is provably untouched (git diff shows
insertions only).
**Acceptance criteria:**
- [x] The 62 missing entities added to the top-level world map as
      individual `<path>`s, consistent with the existing projection/style
- [x] Existing 175 paths' geometry unaffected (append-only diff)

Implementation notes:
- One-off Python conversion script (not committed — same precedent as
  SP-3's original script, which also wasn't shipped): fetches the 50m
  geojson, pre-processes with `ogr2ogr -wrapdateline` (so Pacific entries
  crossing the antimeridian don't produce broken geometry), filters to the
  62 missing `ISO_A2` codes (diffed precisely against the current 175
  during planning — matches the "28 UN states + ~34 territories"
  breakdown exactly), projects, and appends `<path>` elements matching the
  existing attribute set/style exactly.
- No backend code changes needed — `maps/regions.py`'s
  `valid_region_ids()` already derives its allowlist by parsing
  `world.svg` directly (a deliberate SP-10 design choice specifically so
  additions like this wouldn't require touching Python).
- **Investigated and ruled out as a false alarm:** Kiribati and Fiji's
  `getBBox()` widths initially looked like antimeridian-wrapping bugs
  (~970-1000, nearly the full map width). Verified against raw coordinates
  and rendered screenshots — both are legitimate: Kiribati's islands
  genuinely span from ~169°E to ~151°W in reality (a well-known geography
  fact — it's the only country in all four hemispheres), and Fiji
  genuinely straddles the antimeridian, splitting into two well-formed
  fragments at opposite map edges — an inherent, expected property of any
  equirectangular projection at the date line (same as how Russia/Alaska
  typically render on flat world maps), not a rendering defect. No fix
  needed; each individual sub-polygon is compact and correctly shaped.
- **Finding, not fixed (flagged for a possible future ticket):** several
  of the new micro-states (e.g. Monaco, ~8.7×5.6px even at the current 40x
  max zoom) fall well under the 24px WCAG touch-target minimum SP-6
  established for the original 175 — they're smaller than Luxembourg was.
  Raising max zoom further is a global map-behavior change affecting more
  than just these entities, so it's out of scope here; not blocking.
- Verified end-to-end with a real headless-Chrome session (puppeteer-core,
  dev-only): all 237 regions render, a new entity (Monaco) is clickable
  and toggles correctly with the count updating, full SP-4.1–SP-6
  regression pass (keyboard toggle, zoom, pan, reload persistence, mobile
  no-overflow at 375px) all still pass. 30 Django tests (2 new).

### SP-13.2: Italy subdivision drill-down
**Status:** Done
**Description:** Drill-down maps using `COUNTRY:SUBREGION` ids, per the
locked id scheme — first implementation for Italy. Full plan (data
pipeline, projection, UI pattern, all decisions confirmed with the user)
at `/home/thrsh/.claude/plans/wiggly-dancing-fog.md`.
**Acceptance criteria:**
- [x] Italy's 20 regions implemented as a drill-down map, ids using real
      ISO 3166-2:IT codes (e.g. `IT:52` for Toscana) — verified against
      Wikipedia's ISO_3166-2:IT article during planning, not invented
      abbreviations
- [x] In-place swap UI: a "view regions" affordance appears once Italy is
      the last-tapped region on the world map; swaps to the region map in
      the same page, with a way back
- [x] Region toggles (`IT:52`) and the country-level toggle (`IT`) are
      fully independent — no derived/aggregate logic
- [x] `maps/regions.py`'s allowlist covers subdivision ids automatically
      (glob-based, no hardcoded list, consistent with SP-10's design)

Implementation notes:
- One-off Python conversion script (not committed, same precedent as
  SP-3/SP-13.1): dissolves Natural Earth's 1:10m admin-1
  provinces/states set (filtered to Italy's 110 provinces) into the 20
  real regions via `ogr2ogr -dialect sqlite -sql "SELECT region,
  ST_Union(geometry) ... GROUP BY region"`, maps each to its real ISO
  3166-2:IT code via a small hand-built lookup table (Natural Earth's
  admin-1 data has no region-level ISO code for Italy, only
  province-level — needed either way regardless of code scheme), and
  projects with a **local** equirectangular fit to Italy's own bounding
  box (not the world map's 1000×500 space, where these would be
  sub-pixel) into a new `maps/templates/maps/partials/subdivisions/it.svg`.
- `data-region` uses the colon form (`IT:52`, the locked separator) but
  `id` uses a dash (`IT-52`) — deliberately diverging, since `:` is
  reserved in CSS selector syntax and would break `#id` lookups;
  `data-region` remains the single source of truth per CLAUDE.md.
- `maps/regions.py`: `valid_region_ids()` now also globs
  `partials/subdivisions/*.svg` and accepts the `XX:YY` id form —
  automatic, no hardcoded per-country list.
- No other backend changes: `UserProfile.toggle_region` and the
  toggle/get-visits endpoints already treated region ids as opaque
  validated strings; a colon-containing id needed no special handling.
- `map.js`/`map.html`/`map.css`: turned out simpler than planned — the
  subdivision view needs no zoom/pan/tap-vs-drag machinery at all (20
  regions in a tightly-fitted local viewBox, plain click/keydown reusing
  the existing `toggleRegion`), so no generalization of the world map's
  pan/zoom code was needed. `updateVisitedCount()` gained a mode: total
  country count normally, region-count-within-Italy while drilled in.
- **Bug found + fixed during verification:** `.hidden = true/false` does
  not reliably reflect to the `hidden` content attribute on `SVGElement`
  in this environment (it does on plain HTML elements, which is why the
  drill-down/back buttons worked immediately but the `<svg>` swap
  silently did nothing) — switched to explicit
  `setAttribute`/`removeAttribute("hidden")` for the two `<svg>` elements.
- **Bug found + fixed during verification:** the refactored
  `updateVisitedCount()` produced "2 countrys visited" — the generic
  `label + (n===1?"":"s")` pluralization doesn't handle an irregular
  plural; fixed with explicit singular/plural strings for both "country"/
  "countries" and "region"/"regions".
- Investigated Kiribati/Fiji's unusually wide `getBBox()` during SP-13.1
  and initially suspected a rendering bug — ruled out (legitimate
  antimeridian geography), documented under SP-13.1.
- Verified end-to-end with a real headless-Chrome session (puppeteer-core,
  dev-only): clicking Italy at world scale still toggles `IT` normally
  (independence check) and reveals the drill-down button; drilling in
  renders and correctly positions all 20 regions (visually confirmed —
  unmistakably Italy, Sardinia/Sicily correctly placed); toggling Toscana
  fires `POST {"region":"IT:52"}`, highlights the right region, and
  switches the count to "N regions visited"; the back button returns to
  the world map with `IT`'s own toggle state unaffected; both toggles
  persist across a full page reload. Full regression pass (keyboard
  toggle, zoom/pan, mobile no-overflow at 375px) still green. 34 Django
  tests (5 new).

### SP-14: PostgreSQL production database switch *(Later)*
**Status:** To Do
**Description:** Wire `config/settings.py`'s `DATABASES` to switch from
SQLite (dev default) to PostgreSQL via environment variables, per the
plan doc's locked "SQLite (dev) → PostgreSQL (prod)" decision (`CLAUDE.md`
Stack section; plan doc line ~37). No model/schema changes needed —
`UserProfile.visited_regions` (JSONField) works identically on both
engines under Django's ORM. Deploy-config work, not blocking SP-10–13
(those are ORM-level and work the same against SQLite); added as its own
ticket (2026-08-07, user request) rather than folding into deployment
happening implicitly, so it's tracked and doesn't get skipped.
**Acceptance criteria:**
- [ ] `DATABASES` reads Postgres connection settings from environment
      variables (consistent with the existing `python-decouple` pattern
      used for `SECRET_KEY`/`DEBUG`), falling back to the current SQLite
      config when those vars are unset — local `runserver`/tests keep
      working with zero setup
- [ ] Postgres driver added to `requirements.txt`
- [ ] `README.md` documents the required env vars and how to point at a
      local or production Postgres instance
- [ ] Verified against a real (e.g. Dockerized) Postgres instance, not
      just SQLite: migrations apply cleanly, `UserProfile` CRUD and the
      existing test suite pass with `DATABASES` pointed at it
