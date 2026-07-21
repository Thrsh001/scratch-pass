# Scratch Pass — Project Rules

Scratch Pass is a Django + vanilla HTML/CSS/JS app: click a map region, it stays
"scratched" (visited). Phase 1 is localStorage-only; Phase 2 adds accounts and
server persistence. Full architecture: `scratch_map_architecture_94d01ac0.plan.md`.

## Stack (locked — do not deviate without asking)

- **Backend:** Django, SQLite (dev) → PostgreSQL (prod).
- **Frontend:** Vanilla HTML/CSS/JS rendered via Django templates. No React,
  Vue, Svelte, or any SPA framework. No TypeScript. No bundler/build step
  (no Vite, webpack, npm packages for the frontend).
- **No Redis.** Do not introduce it unless there's a measured multi-device
  caching problem — not a hypothetical one.
- **Not a monorepo.** Single Django project (`config/` + `maps/` app). Don't
  introduce workspace/package-boundary tooling.
- `config/wsgi.py` / `config/asgi.py` are deploy entrypoints — leave as Django
  defaults, don't touch for feature work.

## Directory conventions

```
scratch-pass/
├── config/            # Django project package (settings, urls, wsgi/asgi)
├── maps/               # core app: views, models, urls, tests
│   └── templates/maps/ # app-namespaced templates (map.html)
└── static/
    ├── css/map.css
    └── js/map.js
```

- Templates live under `maps/templates/maps/` (app-namespace convention), not
  a top-level `templates/`.
- Static assets are project-level under `static/`, wired via
  `STATICFILES_DIRS` — not per-app static dirs.

## Region ID scheme

- One string per visited region, stored as a JSON array — this shape never
  changes, only the string format does.
- **MVP:** ISO 3166-1 alpha-2 country codes only (`"IT"`, `"US"`).
- **Future:** `COUNTRY:SUBREGION` (`"IT:TO"`), separator is always `:`.
- Never invent a different separator or a nested/object shape for stored
  region data — everything downstream (localStorage, JSONField, API) assumes
  a flat list of strings.
- `data-region` attribute on SVG paths is the single source of truth for a
  region's id; don't duplicate it into `id=` with different values.

## Frontend rules (vanilla JS/CSS/SVG)

- Keep JS dependency-free and small. No npm packages, no transpilation.
- One `<path>` per clickable unit in the SVG; avoid nested `<g>` wrapping that
  breaks click hit-testing.
- Animate only `fill` and `transform` (CSS transitions) — avoid animating
  layout-triggering properties.
- Always respect `prefers-reduced-motion: reduce`.
- Mobile-first: `touch-action: manipulation`, no horizontal overflow, tap
  targets sized for touch.
- localStorage key is versioned (`scratchpass:visited:v1`). If you change the
  stored shape or id format in a breaking way, bump the version and write a
  migration path for existing `v1` data — don't silently reinterpret old data.

## Database & models (Django)

- Never write a destructive migration without a reversible path.
- Index foreign keys.
- Use transactions for multi-step writes.
- Avoid N+1 queries (`select_related`/`prefetch_related`).
- `UserProfile.visited_regions` is a `JSONField` (list of region-id strings),
  one row per user — not a normalized per-region table, unless a real need
  for per-region querying/admin shows up (see plan's "alternate" model).
- If storing region codes in a `CharField` anywhere (e.g. the normalized
  alternate model), cap length ≥16 to fit `CC:SUBDIV`.

## API rules (Phase 2 — not needed until accounts land)

- Validate all input; never trust a client-submitted region code — check it
  against the known id format/allowlist before storing.
- CSRF-protect state-changing endpoints (`X-CSRFToken` header from cookie).
- Return consistent response shapes; the toggle endpoint returns the full
  updated `visited` list so the client can resync `localStorage` as offline
  cache.
- Prefer idempotent endpoints where practical.
- Keep views thin; put persistence logic in model methods/services, not in
  the view body.

## Implementation order — don't jump ahead

Follow the plan's phase order; don't build Phase 2 (auth, API endpoints,
`UserProfile`) work into Phase 1 changes unless explicitly asked:

1. Scaffold Django project + `maps` app + static dirs.
2. Map view + template shell + placeholder SVG.
3. Full world SVG + CSS polish + JS localStorage (country ids only).
4. Mobile pass (viewport, touch targets, reduced motion).
5. *(Later)* Auth + `UserProfile` + toggle API, then subdivision maps.

## General engineering standards

Always: follow existing architecture and naming, minimize unrelated churn,
write maintainable code, add tests for new behavior, update docs when setup
or behavior changes.

Never: introduce breaking changes silently, ignore lint/type errors, commit
debug code, add a dependency (frontend or backend) that isn't necessary,
reformat code unrelated to the task at hand.

Before finishing a change: verify tests pass, verify no lint errors, confirm
the browser behavior actually matches the change (this is a UI-heavy app —
click through it), summarize what changed and flag any risks.

## Testing

- Django tests live in `maps/tests.py` (or a `tests/` package if it grows).
- Arrange / Act / Assert structure; test behavior, not implementation.
- Name tests `test_<expected>_when_<condition>`.
- Mock only true external systems — hit the real Django test DB.
- There is no frontend test runner in this project (no build step); verify
  JS behavior by exercising it in a browser, not by adding a JS test
  framework.

## Documentation

- Update `README.md` when setup/run steps change.
- Update the architecture plan doc when a locked decision changes (stack,
  storage strategy, id scheme) — don't let it silently drift from reality.
- Comment code only to explain *why*, never *what*.

## Git & commits

- Solo project: commit straight to `main`, no feature branches or PRs.
- One commit per logical unit of work — roughly one per phase-plan checklist
  item — not per file save; keep history bisectable.
- Imperative, present-tense subject line (e.g. "Add map view + placeholder
  SVG"); explain *why* in the body only when non-obvious.
- Never commit secrets (`SECRET_KEY`, `.env`, DB credentials) — must be
  gitignored, not just excluded by convention.
- Tag phase milestones (e.g. `phase1-localstorage-complete`) before starting
  the next phase, so there's a known-good point to return to.
