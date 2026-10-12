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
├── extension/         # Chrome extension (WXT + React + TypeScript)
│   ├── entrypoints/
│   │   ├── background.ts          # Service worker: API relay, auth, alarms
│   │   ├── content/               # Injected into Banner pages
│   │   │   ├── index.tsx          # Content script entry
│   │   │   └── modules/           # DOM / page-context features
│   │   └── popup/                 # Extension popup (main UI)
│   ├── components/                # Shared React components
│   ├── lib/                       # API client, storage, messaging helpers
│   ├── hooks/                     # Custom React hooks
│   └── types/                     # Shared TypeScript types
│
├── backend/           # API server (FastAPI + Python 3.14)
│   └── app/
│       ├── api/                   # App router & shared route dependencies
│       ├── modules/               # Per-feature routers, services, schemas, external clients
│       ├── core/                  # Config, database, security
│       └── shared/                # Cross-cutting schemas
```

### How It Works

1. **Popup** — Primary UI: Google sign-in, school selection, schedule builder, semester planner, AI chat, and transcript upload. Talks to the background worker and (for Banner data) to the content script via message passing.
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

### Database & Cache

```bash
cd backend
docker compose up -d   # starts PostgreSQL on 5432 and Redis on 6379
```

Redis holds short-lived data only (caches, rate limits, OAuth state). It runs with persistence off, so its data is gone after a restart — set a TTL on every key and keep anything durable in Postgres.

### Frontend (Chrome Extension)

```bash
cd extension
pnpm install
pnpm dev            # dev build with hot reload → extension/.output/chrome-mv3-dev
```

### Backend (API Server)

```bash
cd backend
cp .env.example .env  # then fill in your secrets
uv sync
uv run alembic upgrade head              # create/update the database schema
uv run uvicorn app.main:app --reload     # dev server at http://localhost:8000
```

In production, run migrations, then start Uvicorn without `--reload`:

```bash
uv run alembic upgrade head
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

Behind a load balancer or reverse proxy, set `FORWARDED_ALLOW_IPS` to the proxy's address so client IPs are read from `X-Forwarded-For`. `WEB_CONCURRENCY` can replace `--workers`.

The app never creates tables itself. After changing a model, generate a migration with `uv run alembic revision --autogenerate -m "..."`, review it, and commit it. Run `alembic upgrade head` as a deploy step before starting the new version.

### Loading the Extension Manually

1. Run `pnpm dev` (or `pnpm build` for a production bundle) in `extension/`.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select `extension/.output/chrome-mv3-dev` (or `extension/.output/chrome-mv3` for `pnpm build`).

## Development

- **Hot reload** — `pnpm dev` in `extension/` watches for changes and reloads the extension automatically.
- **API docs** — Visit `http://localhost:8000/docs` for the interactive Swagger UI.
- **Type safety** — Shared types in `extension/types/` keep content scripts, popup, and API calls in sync.

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/postgres
REDIS_URL=redis://localhost:6379/0
GOOGLE_CLIENT_ID=...           # Google Cloud Console → OAuth client ID (Web application)
GOOGLE_CLIENT_SECRET=...       # Matching secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback
FRONTEND_URL=http://localhost:5173
SESSION_SECRET=...             # Required, 32+ chars: openssl rand -hex 32
OPENAI_API_KEY=sk-...          # Required for chatbot
RMP_AUTH_TOKEN=...              # Rate My Professor auth (optional, has fallback)
```

The API won't start without `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a valid `SESSION_SECRET`.

### Authentication

Sign-in is Google only, using the OAuth 2.0 authorization code flow with OpenID Connect, via [Authlib](https://docs.authlib.org/).

1. `GET /api/v1/auth/google/login` redirects to Google with `state`, `nonce`, and a PKCE challenge. Those values are kept in Redis for 10 minutes. A short-lived signed cookie ties them to the browser that started the flow.
2. `GET /api/v1/auth/google/callback` checks `state`, exchanges the code, and validates the ID token locally against Google's keys (signature, `iss`, `aud`, `exp`, `nonce`). It then upserts the user by Google's `sub` (never by email), opens a session, and redirects to `FRONTEND_URL`. If sign-in fails, it appends `?auth_error=access_denied|failed|account_disabled`.
3. Sessions are server-side, in the Postgres `sessions` table. The `__Host-Http-sid` cookie (`Secure`, `HttpOnly`, `SameSite=Lax`, host-only) holds a random 256-bit token, and only its SHA-256 hash is stored. Sessions expire after 7 days of inactivity or 30 days total. Each sign-in issues a new ID.
4. `POST /api/v1/auth/logout` deletes the session row and clears the cookie. `GET /api/v1/auth/me` returns the current user, or `401`.

Only identity scopes (`openid email profile`) are requested. Google's access token is discarded after sign-in, and no refresh token is requested or stored.

Cookies are always `Secure`. In development, use Chrome on `http://localhost`, which Chrome treats as secure.

The API has no CORS. The web app calls it same-origin at `/api` (Vite proxies it in dev; in production serve both from one domain with `/api` routed to the backend). The extension gets the API host in its `host_permissions`, which lets it call the API without CORS.

The extension reads its config at build time. Copy `extension/.env.example` to `extension/.env` (or `.env.production` for release builds):

```env
WXT_API_URL=http://localhost:8000/api/v1   # Backend API base URL
WXT_GOOGLE_CLIENT_ID=...                   # Same OAuth client ID as the backend
```

## Contributing

1. Fork the repo and create a feature branch.
2. Follow the existing code style — Prettier + ESLint for TS, Ruff for Python.
3. Write tests for new services.
4. Open a PR with a clear description.

## License

MIT
