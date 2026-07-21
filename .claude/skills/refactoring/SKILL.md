---
name: refactoring
description: Use when refactoring existing Scratch Pass code — preserve behavior, reduce complexity, no scope creep.
---

# Refactoring

Objectives:
- Preserve behavior exactly (toggle logic, localStorage schema, region id
  format must not change as a side effect).
- Reduce complexity, improve readability and naming.
- Remove duplication.

Do not:
- Mix refactoring with feature work in the same change.
- Introduce abstractions the current scale doesn't need — this is a small
  app (~200 regions, one JS file); resist adding frameworks, state managers,
  or build tooling to "clean up" vanilla JS/CSS.
