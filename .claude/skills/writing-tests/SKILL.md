---
name: writing-tests
description: Use when adding test coverage for a Scratch Pass feature — Django test cases plus manual browser verification for the vanilla-JS map logic.
---

# Test Generation

For each feature:
- Identify happy paths, edge cases, and error cases.
- Write Django `TestCase`/`Client` tests in `maps/tests.py` for view/model/
  API behavior.
- There is no JS test runner in this project (no build step) — verify
  click/localStorage/refresh behavior manually in a browser and describe
  what you checked.
- Suggest integration tests for critical flows (region toggle persisting
  across reload; once Phase 2 lands, toggle → API → localStorage resync).
- Explain uncovered risks.
