---
name: feature-implementation
description: Use when implementing a new feature or plan todo in Scratch Pass — walks requirements through existing Django/vanilla-JS patterns to a tested, documented change.
---

# Implement Feature

1. Understand the requirement — check it against
   `scratch_map_architecture_94d01ac0.plan.md` for the locked stack/id-scheme
   decisions before writing anything.
2. Inspect existing architecture (`maps/` app structure, `map.html`/`map.js`/
   `map.css` patterns) and reuse it rather than introducing a new pattern.
3. Confirm the change fits the current phase — don't pull in Phase 2 API/auth
   work while doing Phase 1 UI work, or vice versa.
4. Write the implementation using only the locked stack (Django templates,
   vanilla JS/CSS, no build tooling).
5. Add or update tests (`maps/tests.py`).
6. Update `README.md` or the plan doc if setup or a locked decision changed.
7. Explain the change and any risks.
