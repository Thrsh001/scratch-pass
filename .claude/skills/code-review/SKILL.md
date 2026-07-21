---
name: code-review
description: Use when reviewing a diff in Scratch Pass for correctness, simplicity, and stack-fit before merging.
---

# Code Review

Review for:
- **Correctness** — does the change actually toggle/persist/render what it
  claims to, in both the click path and the reload-restore path?
- **Stack fit** — flag anything that introduces a build step, TypeScript, a
  frontend framework, Redis, or monorepo tooling; none of these are part of
  this project (see `CLAUDE.md`).
- **Simplicity** — no abstraction beyond what ~200 regions and a single JS
  file need.
- **Security** — CSRF on state-changing endpoints, no unvalidated region ids
  reaching storage.
- **Performance** — CSS transitions limited to `fill`/`transform`; no N+1
  queries once Phase 2 models exist.
- **Test coverage** — new behavior has a Django test or a described manual
  browser check.
- **Documentation** — README/plan doc updated if setup or a locked decision
  changed.

Provide: blocking issues, non-blocking suggestions, nice-to-have improvements.
