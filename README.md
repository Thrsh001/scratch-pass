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

## Social login (optional)

"Continue with Google" / "Continue with Facebook" use
[django-allauth](https://docs.allauth.org/). Each button stays disabled
until its credentials are set in `.env`; restart the server after editing.

**Google:** in [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
create an OAuth client ID of type "Web application" and add the authorized
redirect URI `http://127.0.0.1:8000/accounts/google/login/callback/`
(match the host/port you run on). Put the values in `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET`.

**Facebook:** in [Meta for Developers](https://developers.facebook.com/apps/),
create an app with the "Authenticate and request data from users with
Facebook Login" use case, add the valid OAuth redirect URI
`http://127.0.0.1:8000/accounts/facebook/login/callback/`, and put the App
ID / App Secret in `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET`. While the app
is in development mode, only its admins/testers can log in; public use
needs Meta's app review and an HTTPS domain.

A first social login creates a new account automatically. It isn't linked
to any existing username/password account (those have no email to match
on), and Google and Facebook logins are separate accounts too.

## PostgreSQL (optional)

By default the app uses a local SQLite file (`db.sqlite3`) and needs no
database setup. Setting `POSTGRES_DB` in `.env` switches it to PostgreSQL;
production should always run this way.

| Variable | Default | |
|---|---|---|
| `POSTGRES_DB` | *(blank → SQLite)* | Database name; setting it enables Postgres |
| `POSTGRES_USER` | *(blank)* | |
| `POSTGRES_PASSWORD` | *(blank)* | |
| `POSTGRES_HOST` | `localhost` | |
| `POSTGRES_PORT` | `5432` | |
| `POSTGRES_CONN_MAX_AGE` | `60` | Seconds to reuse a connection; `0` closes after each request |

To try it locally with Docker:

```bash
docker run -d --name scratchpass-pg -p 127.0.0.1:5432:5432 \
  -e POSTGRES_DB=scratchpass -e POSTGRES_USER=scratchpass \
  -e POSTGRES_PASSWORD=scratchpass postgres:16
```

then set the matching `POSTGRES_*` values in `.env` and run
`python manage.py migrate`. A production host just provides the same
variables. Data is not copied between SQLite and Postgres automatically.

## Stack

- Backend: Django, SQLite (dev) / PostgreSQL (prod).
- Frontend: vanilla HTML/CSS/JS via Django templates — no React/Vue,
  no TypeScript, no bundler.
- Phase 1: visited regions persist in the browser via `localStorage`.
- Phase 2 (later): accounts + server persistence.

See `CLAUDE.md` for project conventions.
