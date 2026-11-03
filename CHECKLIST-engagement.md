# Scratch Pass — Engagement Features Checklist

Ticket-style breakdown of post-MVP engagement work (Epic 3), continuing the
numbering from [`CHECKLIST.md`](./CHECKLIST.md) (Epics 1–2, SP-1…SP-17).
Statuses: `To Do` / `In Progress` / `Blocked` / `Done`. Design and
rationale live in
[`engagement_features.plan.md`](./engagement_features.plan.md); this file
is the authoritative task list for Epic 3.

Recommended order: SP-18 → SP-19 → SP-17 (deploy, in `CHECKLIST.md`) →
SP-20.

---

## Epic 3 — Engagement features

### SP-18: Region info popup
**Status:** To Do
**Description:** Clicking a region opens a popup with its name and a
short Wikipedia description; scratching moves to a button inside the
popup (user decision, 2026-11-03). Docked card on wide screens; phone
behaviour deferred (plan open question 1). Plan section 1.

### SP-18.1: Region description data from Wikipedia
**Status:** To Do
**Description:** Offline, developer-run import that turns every region id
in the SVGs into a short description, committed as static JSON. Never
fetched at runtime.
**Acceptance criteria:**
- [ ] `python manage.py fetch_region_descriptions` maps ids → Wikidata
      (P297 countries, P300 subdivisions) → English Wikipedia summary,
      standard library only (no new dependency)
- [ ] Writes `static/data/descriptions/<CC>.json` per country (the
      country + its subdivisions), each entry with `name`, `extract`,
      `source_url`
- [ ] Manual overrides file for ids Wikidata can't match or extracts that
      read badly; overrides win over fetched data
- [ ] Command reports unmatched ids instead of failing; coverage noted in
      the ticket when done (target: every country, subdivisions
      best-effort)
- [ ] Tests for the id → Wikidata mapping and output shape, with the HTTP
      calls mocked (Wikipedia/Wikidata are external systems)
- [ ] README documents how and when to re-run it
**Risks:**
- Wikidata may hold several items with the same ISO code (historic
  entities); the command must prefer current ones and log the rest.

### SP-18.2: Popup / bottom sheet UI
**Status:** To Do
**Blocked by:** SP-18.1 for descriptions (the shell can be built first
and show the name only)
**Acceptance criteria:**
- [ ] Click (existing tap-vs-drag threshold) opens the popup instead of
      toggling; panning unaffected
- [ ] Phone interaction implemented as decided in plan open question 1
      (tap behaviour + layout; recommended: bottom sheet) — decide
      before starting the mobile part
- [ ] Shows the name (from `aria-label`), the extract, "Read more on
      Wikipedia" link and a CC BY-SA attribution line
- [ ] Plain region → "Scratch it" / "Un-scratch" button with
      `aria-pressed`; scratching updates the map, counter and server
      exactly as clicking did before
- [ ] Country with a drill-down → "Explore regions" button instead of
      scratch; inside a drill-down, subdivisions get the scratch button
- [ ] Description JSON lazy-loaded per country on first open, cached for
      the session; missing description → name only, no error
- [ ] Docked card on wide screens; narrow-screen layout per open
      question 1, from the same element via a CSS media query
- [ ] Non-modal: clicking another region swaps content; close button,
      clicking empty map, or `Esc` closes it
- [ ] Keyboard: `Enter`/`Space` on a region opens it and moves focus
      inside; closing returns focus to the region
- [ ] Slide-in animates `transform` only; no slide under
      `prefers-reduced-motion: reduce`
- [ ] Touch targets sized for touch, no horizontal overflow on a phone
- [ ] Verified in a browser on desktop and on a phone
**Risks:**
- Scratching now takes two clicks instead of one — see SP-18.3 for
  phones.

### SP-18.3: Long-press quick scratch *(Pending decision)*
**Status:** To Do — part of the deferred phone decisions (plan open
question 1); only needed if a tap opens the popup on phones
**Description:** Long-press (~500 ms, no movement) on a region toggles it
directly without opening the popup, so filling in many regions stays
fast.
**Acceptance criteria:**
- [ ] Long-press toggles; a press that moves past the tap threshold or
      gets a second finger is cancelled
- [ ] Long-press doesn't trigger the browser's context menu or text
      selection on mobile
- [ ] Brief visual feedback on toggle (reduced-motion aware)
- [ ] Verified on a phone

### SP-19: Achievements stage 1 — computed badges
**Status:** To Do
**Description:** Badges derived purely from `visited_regions`
(milestones, continents, completing a drill-down country, curated
groupings). Computed on request, no new tables; un-scratching can remove
a badge (user decision, 2026-11-03). Plan section 2.

### SP-19.1: Continent data + server-side "effectively visited"
**Status:** To Do
**Acceptance criteria:**
- [ ] Committed country → continent mapping from Natural Earth's
      `CONTINENT` field; every country id in `world.svg` has an entry
      (test enforces it)
- [ ] Python helper for effectively visited countries (stored directly
      or via any subdivision), matching `map.js`'s
      `isEffectivelyVisited`
- [ ] Tests cover direct, subdivision-only and mixed cases

### SP-19.2: Badge definitions + achievements API
**Status:** To Do
**Blocked by:** SP-19.1
**Acceptance criteria:**
- [ ] Badge definitions in `maps/achievements.py`: id, name, description,
      emoji icon, rule returning `(current, target)`
- [ ] Initial set agreed with the user before implementing (draft in plan
      section 2)
- [ ] `GET /api/me/achievements/` → all badges with `earned` and
      progress; 401 when logged out, like the other `api/me/` endpoints
- [ ] Toggle response gains an additive `earned` list of badge ids;
      `visited` unchanged
- [ ] Tests per badge kind, including un-scratching removing a badge;
      no N+1 queries (one profile read per request)

### SP-19.3: Achievements UI
**Status:** To Do
**Blocked by:** SP-19.2
**Acceptance criteria:**
- [ ] Achievements panel opened from the header: earned first, locked
      greyed out with progress ("7 / 10")
- [ ] "New badge!" toast when a toggle earns one (diff of `earned`);
      reduced-motion aware
- [ ] Works on a phone (panel fits, tap targets sized for touch)
- [ ] Verified in a browser

### SP-20: Achievements stage 2 — sights & quests (honour system)
**Status:** To Do
**Description:** Users mark individual sights as visited ("I've been
here", no verification — user decision, 2026-11-03), but only once the
sight's region is scratched (user decision, 2026-11-03); curated quests
(sets of sights) award badges. Plan section 3.

### SP-20.1: Sight model + UNESCO import
**Status:** To Do
**Acceptance criteria:**
- [ ] `Sight` model (slug, name, `region_id` `CharField(max_length=16)`
      indexed, lat/lng, description, Wikipedia URL, Wikidata id),
      registered in admin
- [ ] Migration is additive only
- [ ] Management command imports UNESCO World Heritage Sites from
      Wikidata; region assigned at country level, subdivision
      best-effort via the "located in" chain; re-running updates
      rather than duplicates
- [ ] Every imported `region_id` passes the existing region allowlist
      (sights outside known regions are skipped and reported)
- [ ] Tests with HTTP mocked

### SP-20.2: Sight check-ins in the popup
**Status:** To Do
**Blocked by:** SP-18.2, SP-20.1
**Acceptance criteria:**
- [ ] `SightVisit` model (user + sight FKs indexed, unique together,
      `created_at`)
- [ ] `POST /api/me/sights/<slug>/toggle/` — CSRF-protected, unknown slug
      → 404, returns the full list of visited sight slugs; idempotent
      for repeated requests in the same direction
- [ ] Checking a sight whose region isn't scratched is rejected by the
      server (country-level sights in drill-down countries: any of the
      country's regions scratched counts); un-checking always allowed
- [ ] Popup shows a "Sights here" list with "I've been here" checkboxes,
      disabled with a "Scratch this region first" hint until the region
      is scratched
- [ ] Un-scratching a region keeps its check-ins stored but uncounted
      (quest progress, popup) until it's scratched again (user decision,
      2026-11-03)
- [ ] Persistence logic in model methods/services, view stays thin
- [ ] Tests for the toggle, the scratched-region rule and validation
- [ ] Verified in a browser

### SP-20.3: Quests
**Status:** To Do
**Blocked by:** SP-20.2
**Acceptance criteria:**
- [ ] `Quest` model (slug, name, description, emoji icon, M2M to
      `Sight`), curated in admin
- [ ] Completed quests show up as badges in the achievements API and
      panel alongside stage 1 badges, with progress ("3 / 7 sights")
- [ ] A few starter quests seeded (data migration or fixture, reversible)
- [ ] Achievements endpoint stays query-bounded with quests
      (`prefetch_related`, no per-quest queries)
- [ ] Verified in a browser

### SP-20.4: Sight markers on the map *(Optional)*
**Status:** To Do — only if the popup list proves insufficient (plan open
question 2)
**Acceptance criteria:**
- [ ] Markers shown only above a zoom level, so ~1,200 points never
      render at once
- [ ] Marker tap opens the region popup scrolled to that sight
- [ ] Map pan/zoom stays smooth on a phone

---

## Parked

- **User photos** — "maybe, in the future" (user, 2026-11-03). Design
  notes in plan section 4; no tickets until it's picked up.
