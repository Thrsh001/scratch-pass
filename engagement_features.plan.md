---
name: Scratch Pass Engagement Features
overview: Post-MVP plan for region info popups (Wikipedia-sourced descriptions), achievements as badges (stage 1 computed from visited regions, stage 2 honour-system sight quests), with user photos parked as future work.
todos:
  - id: checklist
    content: Task tracking lives in CHECKLIST-engagement.md (Epic 3, SP-18..SP-20) — that file is the source of truth, not this list.
    status: pending
isProject: false
---

# Scratch Pass — Engagement Features Plan (Epic 3)

> **Task tracking lives in [`CHECKLIST-engagement.md`](./CHECKLIST-engagement.md)**
> (tickets `SP-18`…`SP-20`). This doc is design/rationale — update it when
> a decision below changes, but track build progress in the checklist.
>
> Builds on the existing architecture in
> [`scratch_map_architecture_94d01ac0.plan.md`](./scratch_map_architecture_94d01ac0.plan.md);
> the locked stack and region id scheme there still apply unchanged.

## Scope

| Feature | Status | Tickets |
|---|---|---|
| Region info popup (name + Wikipedia description) | Planned | SP-18 |
| Achievements stage 1 — badges computed from visited regions | Planned | SP-19 |
| Achievements stage 2 — sights & quests, honour system | Planned | SP-20 |
| User photos per visited region | Parked — "maybe, in the future" | none |

Recommended order: SP-18 → SP-19 → SP-17 (production deploy, original
checklist) → SP-20. SP-18/19 add no new database tables, so they're safe
to ship before the first deploy; SP-20 adds models and a data import, and
is easier to land on top of a known-good production setup.

## Decisions made (2026-11-03, user)

- **Clicking a region opens a popup; scratching happens from a button
  inside it** (desktop). A click no longer toggles a region directly.
  Phone behaviour is decided separately — see open question 1.
- **Descriptions come from Wikipedia.**
- **Achievements ship in two stages:** computed badges first, sight-based
  quests second.
- **Badges are computed live, not stored.** Un-scratching a region can
  take a badge away again; the badges always reflect the current map.
- **Sight visits use the honour system** — the user says "I've been
  here", nothing is verified.
- **A sight can only be checked once its region is scratched.** Checking
  a sight never scratches the region for you.
- **Photos are parked** — design notes kept below, no tickets.

## Open questions

1. **Phone interaction — deferred by the user (2026-11-03).** To decide
   before SP-18.2's mobile work:
   - Does a tap open the popup (like a desktop click) or keep toggling
     directly?
   - Popup layout on a phone. Recommendation: a bottom sheet rather than
     a floating box, so it doesn't cover the region that was tapped.
   - Long-press as a quick-scratch shortcut (SP-18.3), if tapping opens
     the popup. Recommendation: yes, so filling in many regions doesn't
     take two taps each.
2. **What happens to checked sights when their region is un-scratched?**
   Recommendation: keep the stored check-ins but count them only while
   the region is scratched — like badges, nothing is lost and
   re-scratching brings them back. The alternatives (block the
   un-scratch, or delete the check-ins) either get in the user's way or
   lose data.
3. **Sight markers on the map, or sights listed only in the popup?**
   Recommendation: popup list first (SP-20.2); markers are an optional
   follow-up (SP-20.4) because ~1,200 points need zoom-dependent
   rendering to stay readable and fast.

## 1. Region info popup (SP-18)

### Interaction

- **Click a region → the popup opens** for that region. Panning behaves
  as today (the existing tap-vs-drag threshold in `map.js` decides what
  counts as a click). Phone taps follow open question 1.
- **Popup contents:** region name (from the path's existing
  `aria-label`, no new data needed), Wikipedia extract, a "Read more on
  Wikipedia" link + licence line, and the primary action:
  - plain country or subdivision → **"Scratch it" / "Un-scratch"**
    button (`aria-pressed` mirrors visited state);
  - country with a drill-down map (IT, FR, …) → **"Explore regions"**
    button that enters the drill-down. No scratch button, because that
    country's visited state is derived from its regions.
- **Wide viewport:** docked as a card at the side of the map. **Narrow
  viewport:** layout pending open question 1 (recommended: the same
  element as a bottom sheet, switched by a CSS media query — no separate
  code paths).
- **Non-modal:** the map stays interactive behind it. Clicking another
  region swaps the content; clicking empty map, the close button, or
  `Esc` closes it.
- **Keyboard:** `Enter`/`Space` on a focused region opens the popup and
  moves focus into it; closing returns focus to the region.
- **Motion:** slides in via `transform` only; with
  `prefers-reduced-motion: reduce` it appears without sliding (per
  `CLAUDE.md`'s animation rules).

### Description data

Fetched **once, offline, by a developer** — never at runtime by the app
or the browser:

- A management command, `python manage.py fetch_region_descriptions`,
  uses only the standard library (`urllib`, `json`) — no new dependency.
- **Mapping region id → Wikipedia article goes through Wikidata**, which
  stores ISO codes for countries (property P297, e.g. `IT`) and for
  subdivisions (P300, e.g. `FR-ARA`; our ids just swap `-` for `:`).
  The Wikidata item's English Wikipedia link gives the article, and the
  Wikipedia REST "page summary" endpoint gives a short plain-text
  extract.
- **Manual overrides file** for ids Wikidata can't match cleanly
  (Natural Earth quirks such as Kosovo or Northern Cyprus) and for
  extracts that read badly.
- **Output: committed static JSON, one file per country**,
  `static/data/descriptions/<CC>.json`, holding that country and all its
  subdivisions. The popup fetches the file the first time it opens a
  region in that country (~240 small files rather than one large
  download). A region missing from the data shows its name only.
- **Licensing:** Wikipedia text is CC BY-SA 4.0. Each entry stores its
  source article URL, and the popup shows "From Wikipedia, CC BY-SA" with
  that link. Wikidata is CC0 (no attribution needed).
- English only for now; the file layout leaves room for
  `descriptions/<lang>/<CC>.json` later.

## 2. Achievements — stage 1: computed badges (SP-19)

Badges derived purely from the existing `visited_regions` list. No user
input, no new tables.

### Badge kinds (initial set; final list decided in SP-19.2)

- **Milestones:** 1, 5, 10, 25, 50, 100 countries.
- **Continents:** first country on each continent; "all six inhabited
  continents"; % of a continent's countries.
- **Completionist:** every subdivision of one drill-down country (e.g.
  all 20 Italian regions).
- **Groupings:** hand-picked sets like Scandinavia or the Benelux.

### Design

- **Continent data:** a committed country → continent mapping, taken
  from Natural Earth's `CONTINENT` field (same source as `world.svg`),
  so it can't disagree with the map.
- **"Effectively visited" in Python:** a country counts as visited if
  it's stored directly *or* any of its subdivisions are. `map.js`
  already has this rule (`isEffectivelyVisited`); the server needs the
  same rule so badge counts match the counter the user sees. Tests pin
  the two to each other on shared examples.
- **Badge definitions live in code** (`maps/achievements.py`): each has
  an id, name, description, icon (emoji — no image assets), and a rule
  that takes the visited set and returns `(current, target)`, so locked
  badges can show progress ("7 / 10 countries").
- **Computed on request, not stored** (user decision, 2026-11-03).
- **API:**
  - `GET /api/me/achievements/` → every badge with earned flag and
    progress.
  - The existing toggle response gains an additive `earned` field (ids
    of badges earned right now). The client compares it with the
    previous value to show a "New badge!" toast. The `visited` field is
    unchanged, so the localStorage resync keeps working.
- **UI:** an achievements panel reachable from the header — earned
  badges first, locked ones greyed out with progress.

## 3. Achievements — stage 2: sights & quests (SP-20)

Adds the idea of **sights**: specific places (points, not regions) that a
user can mark as visited. **Quests** are curated sets of sights;
completing one earns a badge.

### Data model

- **`Sight`:** `slug` (unique), `name`, `region_id`
  (`CharField(max_length=16)`, indexed — fits `CC:SUBDIV`), `lat`,
  `lng`, short `description`, `wikipedia_url`, `wikidata_id`.
- **`SightVisit`:** `user` FK + `sight` FK (both indexed), `created_at`,
  unique on (user, sight). **A normalized table, unlike
  `visited_regions`:** sights are database rows, not fixed ids taken
  from the SVG, so a foreign key keeps visits valid if a sight is
  edited or removed. This doesn't change the region storage rule in
  `CLAUDE.md`.
- **`Quest`:** `slug`, `name`, `description`, `icon`, M2M to `Sight`.
  Curated in Django admin. Completing a quest = visiting all its
  sights; quest badges then appear alongside the stage 1 code badges.

### Starter dataset

- **UNESCO World Heritage Sites via Wikidata** (CC0): ~1,200 sites, each
  with coordinates and a country. Imported by a management command, like
  the descriptions. Country comes from Wikidata's "country" property.
  Subdivision is best-effort, and only for drill-down countries:
  - walk up "located in" until an item with an ISO 3166-2 code (P300)
    is found;
  - otherwise the sight belongs to the country.
- Example quests to seed: "Seven New Wonders", "Roman Empire highlights",
  "Iberian treasures".

### Interaction (honour system)

- The region popup gains a **"Sights here"** section listing that
  region's sights, each with an "I've been here" checkbox.
- **The region must be scratched first.** While it isn't, the checkboxes
  are disabled with a hint ("Scratch this region first"). A sight
  attached to a drill-down country as a whole (no subdivision match)
  needs that country to be effectively visited, i.e. any of its regions
  scratched.
- `POST /api/me/sights/<slug>/toggle/` — CSRF-protected, validates the
  slug against the `Sight` table, and rejects checking a sight whose
  region isn't scratched (the server enforces the rule, not just the
  disabled checkbox). It returns the full list of the user's visited
  sight slugs.
- Un-scratching a region with checked sights: pending open question 2.
- No verification beyond the scratched-region rule. Trust-based by
  design — this is a personal tracker, with no leaderboard that would
  make cheating matter.

## 4. Parked: user photos (no tickets)

Not scheduled. Notes so the design isn't lost:

- Needs **Pillow** (Django's `ImageField` requires it) — a new
  dependency.
- **Production storage:** most hosting platforms wipe local disk on
  deploy, so photos would need object storage (S3, Cloudflare R2 —
  likely `django-storages`). If photos ever come back, pick SP-17's host
  with that in mind.
- **Privacy:** strip EXIF metadata on upload (phone photos embed GPS
  location). Default photos to private; public photos would need
  moderation.
- Size limits, thumbnails, and what happens to a region's photos if it's
  un-scratched (recommend: keep them).
- Photo GPS could later serve as optional sight "verification" — still
  not required, consistent with the honour system.

## 5. Other ideas — proposed, not scheduled

Raised during planning (2026-11-03), not yet accepted or declined:

- **Stats panel:** % of the world visited, counts per continent. Reuses
  SP-19's continent data and visited-count logic.
- **Wishlist:** a second "want to go" state with its own colour, stored
  as a separate list so `visited_regions` stays unchanged.
- **Visit journal:** date + note per visited region — would need a
  per-user, per-region record. Photos would attach to the same record.
- **Share card/link** of the user's map (already floated pre-launch).
