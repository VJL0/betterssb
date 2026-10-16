# BetterSSB

A Chrome extension that supercharges Ellucian Self-Service Banner (SSB) — the registration portal used by hundreds of universities. BetterSSB injects directly into your school's registration pages to add features that Banner should have shipped out of the box.

## Features

| Feature | Description |
|---|---|
| **Rate My Professor Ratings** | Professor ratings and reviews appear inline on search results and class listings — no more tab-switching. |
| **Automatic Schedule Builder** | Generate optimized schedules from your preferred courses, accounting for time conflicts, gaps, and preferences. |
| **Auto-Registration** | Queue up your desired sections and auto-register the moment enrollment opens. |
| **Semester Planner** | Plan future semesters visually with a drag-and-drop calendar and course cart. |
| **Enhanced UI** | A modern, accessible interface layered on top of Banner's legacy pages. |
| **AI Chatbot Advisor** | Ask questions about courses, prerequisites, and degree progress in natural language. |
| **Transcript & Degree Audit** | Upload your transcript and degree requirements to see exactly which courses you're eligible for — prerequisites that aren't met are clearly disabled. |

## Architecture

```
betterssb/
├── apps/
│   ├── extension/     # Chrome extension (WXT + React + TypeScript)
│   │   ├── entrypoints/
│   │   │   ├── background.ts          # Service worker: API relay, auth, alarms
│   │   │   ├── content/               # Injected into Banner pages
│   │   │   │   ├── index.tsx          # Content script entry
│   │   │   │   └── modules/           # DOM / page-context features
│   │   │   └── popup/                 # Extension popup (main UI)
│   │   ├── components/                # Shared React components
│   │   ├── lib/                       # API client, storage, messaging helpers
│   │   ├── hooks/                     # Custom React hooks
│   │   └── types/                     # Shared TypeScript types
│   │
│   ├── api/           # API server (FastAPI + Python 3.14)
│   │   └── app/
│   │       ├── api/                   # App router & shared route dependencies
│   │       ├── modules/               # Per-feature routers, services, schemas, external clients
│   │       ├── core/                  # Config, database, security
│   │       └── shared/                # Cross-cutting schemas
│   │
│   ├── web/           # Web app (Vite + React + shadcn/ui)
│   └── ellucian-api/  # Mock Ellucian SSB API (FastAPI)
│
└── packages/
    └── ui/            # Shared shadcn/ui components and Tailwind theme
```

### How It Works

1. **Popup** — Primary UI: sign-in (via the backend), school selection, schedule builder, semester planner, AI chat, and transcript upload. Talks to the background worker and (for Banner data) to the content script via message passing.
2. **Content Script** — Runs only on Banner URLs (`*://*.edu/StudentRegistrationSsb/*`, `*://*.edu/ssb/*`). Handles anything that must execute in the page: calling Ellucian’s in-page APIs for the popup, injecting Rate My Professor badges on listings, and filling/submitting registration forms for auto-registration.
3. **Background Service Worker** — Relays non-SSB work to the backend (schedules, chat, transcript parsing, RMP search), forwards `SSB_*` messages to an open Banner tab, registration alarms, and `chrome.storage`.
4. **Backend API** — Rate My Professor lookups, schedule optimization, transcript parsing, chatbot inference, and prerequisite validation.

**Where each feature lives**

| Feature | Popup | Content |
| --- | --- | --- |
| Sign-in, school | Yes | |
| Schedule builder & semester planner | Yes | (SSB calls run in page) |
| AI chat & transcript tools | Yes | |
| Rate My Professor on course rows | | Yes |
| Auto-registration (CRN fields / submit) | | Yes |

## Tech Stack

| Layer | Technology |
|---|---|
| Extension Framework | [WXT](https://wxt.dev) v0.20+ |
| UI | React 19, TypeScript 5.9 |
| State | `chrome.storage` via custom `useStorage` hook |
| Backend | FastAPI, Python 3.14 |
| Database | PostgreSQL 18 (Docker), SQLAlchemy 2 |
| Cache | Redis 8 (Docker), short-lived data only |
| Auth | Google OAuth 2.0 / OpenID Connect (Authlib), server-side sessions |
| AI / LLM | OpenAI API |
| RMP Data | Rate My Professor GraphQL API |

## Getting Started

### Prerequisites

- **Node.js** ≥ 22 and **pnpm** ≥ 9
- **Python** ≥ 3.14 and **uv** (Python package manager)
- **Docker** and **Docker Compose** (for PostgreSQL and Redis)
- A Chromium-based browser

### Setup

```bash
pnpm install                          # JS dependencies for every workspace package
cd apps/api
cp .env.example .env                  # then fill in your secrets
uv sync                               # Python dependencies (pnpm doesn't install these)
docker compose up -d                  # PostgreSQL on 5432, Redis on 6379
uv run alembic upgrade head           # create/update the database schema
```

Redis holds short-lived data only (caches, rate limits, OAuth state). It runs with persistence off, so its data is gone after a restart — set a TTL on every key and keep anything durable in Postgres.

### Running

From the repo root, with Docker running:

```bash
pnpm dev     # Postgres + Redis, API on :8000, web on :5173, extension → apps/extension/.output/chrome-mv3-dev
pnpm lint    # ESLint + Ruff
pnpm test    # pytest
pnpm format  # Prettier + Ruff
```

Run a subset with `pnpm turbo dev --filter=api --filter=web`. Migrations aren't part of `dev`; run `uv run alembic upgrade head` in `apps/api` after pulling new ones.

In production, run migrations, then start Uvicorn without `--reload`:

```bash
uv run alembic upgrade head
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4 --no-server-header
```

Behind a load balancer or reverse proxy, set `FORWARDED_ALLOW_IPS` to the proxy's address so client IPs are read from `X-Forwarded-For`. `WEB_CONCURRENCY` can replace `--workers`.

The API adds `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Content-Security-Policy: frame-ancestors 'none'` to every response ([OWASP REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html#security-headers)). Set `Strict-Transport-Security` at the HTTPS proxy, where it also covers the web app's pages. `--no-server-header` drops Uvicorn's `Server` header.

The app never creates tables itself. After changing a model, generate a migration with `uv run alembic revision --autogenerate -m "..."`, review it, and commit it. Run `alembic upgrade head` as a deploy step before starting the new version.

### Loading the Extension Manually

1. Run `pnpm dev` (or `pnpm build` for a production bundle) in `apps/extension/`.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select `apps/extension/.output/chrome-mv3-dev` (or `apps/extension/.output/chrome-mv3` for `pnpm build`).

## Development

- **Hot reload** — `pnpm dev` in `apps/extension/` watches for changes and reloads the extension automatically.
- **API docs** — Visit `http://localhost:8000/docs` for the interactive Swagger UI.
- **Errors** — API errors are [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem details (`application/problem+json`) with `type`, `title`, `status`, and an optional user-safe `detail`; validation errors add an `errors` list. Raise `HTTPException` in endpoints; `app/core/errors.py` formats it. Sign-in failures redirect to the frontend with `?auth_error=` instead.
- **Type safety** — Shared types in `apps/extension/types/` keep content scripts, popup, and API calls in sync.

## Environment Variables

Copy `apps/api/.env.example` to `apps/api/.env` and fill in:

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/postgres
REDIS_URL=redis://localhost:6379/0
GOOGLE_CLIENT_ID=...           # Google Cloud Console → OAuth client ID (Web application)
GOOGLE_CLIENT_SECRET=...       # Matching secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
FRONTEND_URL=http://localhost:5173
SESSION_SECRET=...             # Required, 32+ chars: openssl rand -hex 32
OPENAI_API_KEY=sk-...          # Required for chatbot
RMP_AUTH_TOKEN=...              # Rate My Professor auth (optional, has fallback)
```

The API won't start without `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a valid `SESSION_SECRET`.

### Authentication

Sign-in is Google only, using the OAuth 2.0 authorization code flow with OpenID Connect, via [Authlib](https://docs.authlib.org/).

1. `GET /api/auth/google/login` redirects to Google with `state`, `nonce`, and a PKCE challenge. Those values are kept in Redis. A signed cookie that expires after 10 minutes ties them to the browser that started the flow, so sign-in must finish within that time.
2. `GET /api/auth/google/callback` checks `state`, exchanges the code, and validates the ID token locally against Google's keys (signature, `iss`, `aud`, `exp`, `nonce`). It then upserts the user by Google's `sub` (never by email), opens a session, and redirects to `FRONTEND_URL`. If sign-in fails, it appends `?auth_error=access_denied|failed|account_disabled`.
3. Sessions are server-side, in the Postgres `sessions` table. The `__Host-Http-sid` cookie (`Secure`, `HttpOnly`, `SameSite=Lax`, host-only) holds a random 256-bit token, and only its SHA-256 hash is stored. Sessions expire after 7 days of inactivity or 30 days total. Each sign-in issues a new ID.
4. `POST /api/auth/logout` deletes the session row and clears the cookie. `GET /api/auth/me` returns the current user, or `401`.

Only identity scopes (`openid email profile`) are requested. Google's access token is discarded after sign-in, and no refresh token is requested or stored.

Cookies are always `Secure`. In development, use Chrome on `http://localhost`, which Chrome treats as secure.

The API has no CORS. The web app calls it same-origin at `/api` (Vite proxies it in dev; in production serve both from one domain with `/api` routed to the backend). The extension gets the API host in its `host_permissions`, which lets it call the API without CORS.

Both clients sign in through the backend; neither talks to Google or holds a token:

- **Web** — "Sign in with Google" links to `/api/auth/google/login`. The page reads the user from `/api/auth/me` and shows `?auth_error=` messages after a failed sign-in.
- **Extension** — the popup's Login tab opens `${WXT_API_URL}/auth/google/login` in a new tab. Its requests use `credentials: "include"`, and its host permission for the API lets the session cookie through, so it shares the web app's session. After sign-in the tab lands on `FRONTEND_URL`; reopen the popup to see the account.

The extension reads its config at build time. Copy `apps/extension/.env.example` to `apps/extension/.env` (or `.env.production` for release builds):

```env
WXT_API_URL=http://localhost:8000/api   # Backend API base URL
```

## Contributing

1. Fork the repo and create a feature branch.
2. Follow the existing code style — Prettier + ESLint for TS, Ruff for Python.
3. Write tests for new services.
4. Open a PR with a clear description.

## License

MIT
