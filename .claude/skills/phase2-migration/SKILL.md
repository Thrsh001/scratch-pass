---
name: phase2-migration
description: Use when moving a Phase 1 localStorage-only feature to Phase 2 server-backed persistence (UserProfile + toggle API), per the plan's transition steps.
---

# Phase 1 → Phase 2 Migration

Follow the plan's transition sequence exactly — don't skip the optimistic-UI
or guest-merge steps:

1. Keep optimistic UI: toggle the `.visited` class immediately on click,
   before any network round trip.
2. On login/auth, `GET /api/me/visits/` and reconcile with existing
   `localStorage` state — offer a merge (union of local + server) rather than
   silently overwriting either side.
3. On click (post-login), `POST /api/me/visits/toggle/` with
   `{"region": "<id>"}`, include `X-CSRFToken`. Server returns the full
   updated `visited` list.
4. Resync `localStorage` from the server response so it keeps acting as an
   offline cache — never let it drift from server state after a successful
   toggle.
5. On a failed request, revert the optimistic class toggle.
6. Guest (unauthenticated) users keep pure `localStorage` behavior unchanged
   — Phase 2 must not break Phase 1 UX for anonymous visitors.
7. Persist server-side via `UserProfile.visited_regions` (JSONField list),
   not a new/different shape — the id scheme and array shape are unchanged
   from Phase 1.
