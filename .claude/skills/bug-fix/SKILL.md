---
name: bug-fix
description: Use when fixing a reported bug in Scratch Pass — reproduce, root-cause, minimal fix, regression test.
---

# Bug Fix

1. Reproduce the bug (in-browser for map/click/localStorage issues, or via
   Django test for server-side issues).
2. Find the root cause — don't patch a symptom (e.g. a stale `.visited`
   class) without checking whether `localStorage` state or the DOM is out of
   sync with it.
3. Implement the minimal fix.
4. Check for regressions in related region-toggle behavior (click, refresh
   restore, and — once Phase 2 lands — server sync).
5. Add a regression test.
6. Explain why it happened.
