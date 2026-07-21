---
name: security-audit
description: Use when reviewing Scratch Pass for security issues — Django CSRF/auth surface plus client-side region-id trust boundaries.
---

# Security Review

Check for:
- **CSRF** — every state-changing Phase 2 endpoint (`POST /api/me/visits/
  toggle/`) must validate `X-CSRFToken`.
- **Untrusted client input** — a region id from `request.body` must be
  validated against the known id format/allowlist before being stored or
  echoed back, not trusted as-is.
- **XSS** — SVG/region data must never be interpolated into templates or DOM
  via unescaped HTML/`innerHTML`.
- Authentication / authorization (Phase 2: a user can only read/write their
  own `UserProfile`).
- Secrets (no credentials in settings.py committed to VCS).
- Dependency risk (frontend has none by design; check Django/requirements.txt
  pins).
- SQL injection is low-risk via the ORM, but flag any raw SQL.

Classify findings: Critical / High / Medium / Low.
