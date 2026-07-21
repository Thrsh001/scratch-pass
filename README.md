# Scratch Pass

Click a map region, watch it "scratch" in — a visited-places tracker.
Django backend, vanilla HTML/CSS/JS frontend, no build tooling.

Architecture and phased plan: `scratch_map_architecture_94d01ac0.plan.md`.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # then fill in a real SECRET_KEY
python manage.py migrate
python manage.py runserver
```

Visit http://127.0.0.1:8000/.

## Stack

- Backend: Django, SQLite (dev).
- Frontend: vanilla HTML/CSS/JS via Django templates — no React/Vue,
  no TypeScript, no bundler.
- Phase 1: visited regions persist in the browser via `localStorage`.
- Phase 2 (later): accounts + server persistence.

See `CLAUDE.md` for project conventions.
