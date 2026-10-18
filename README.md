# BetterSSB

A website and a Chrome extension that make Ellucian Self-Service Banner (SSB) registration easier. Start on the website as a guest: search sections, build a schedule, plan your terms and read your degree audit. Add the extension to bring live Banner data onto those pages, auto-register when your window opens, and see ratings, seats and your plan on Banner's own pages.

Everything is saved on your device. There's no account yet; sign-in for sync is a later phase.

## Features

| Feature | Description |
|---|---|
| **Search** | Every section of a term from Banner's public class search, with Rate My Professors ratings, live seats and filters. Add sections to your plan, with an undo. |
| **Schedule builder** | Generates conflict-free schedules from the courses in your plan, by your days, hours and ranking. Save one to the plan, queue its CRNs for auto-register or export it as `.ics`. |
| **Semester planner** | Your terms side by side, the credits planned, what your audit still needs and a projected finish. |
| **Degree audit** | Runs your DARS audit through the extension (or reads an uploaded audit) and shows each requirement's progress. |
| **Transcript** | Paste your unofficial transcript to see your courses by term, GPA and what each counts toward. |
| **AI advisor** | Ask about your plan, audit and transcript. You choose which of them the advisor can see. |
| **Auto-register** | Queue CRNs, pick a time, arm it; the extension submits them in your Banner tab when registration opens. |
| **On Banner pages** | Ratings before instructors, seat meters, "In your plan" and conflict tags, and a plan dock on Banner's class search. One setting turns it all off. |
| **Popup** | Today (countdown, this tab, your plan with live seats), Search, Register and Audit at a glance. |

## Architecture

```
betterssb/
├── apps/
│   ├── web/           # Website (Vite + React 19 + React Router + TanStack Query)
│   │   └── src/
│   │       ├── app/                   # Router, header, phone tab bar, error and 404 pages
│   │       ├── features/              # One folder per route: search, schedule, plan, audit…
│   │       ├── components/ · hooks/   # Shared across routes
│   │       └── lib/                   # Local store, extension bridge client, config
│   │
│   ├── extension/     # Chrome extension (WXT + React + TypeScript)
│   │   ├── entrypoints/
│   │   │   ├── background.ts          # Service worker: Banner relay, DARS, auto-register alarms
│   │   │   ├── content/               # Injected into Banner pages
│   │   │   │   ├── index.tsx          # Content script entry (Banner API calls)
│   │   │   │   └── overlay/           # Ratings, seats, plan tags and dock (shadow roots)
│   │   │   ├── web-bridge.content.ts  # The website ↔ extension bridge
│   │   │   ├── dars.content.ts        # Reads the DARS audit page
│   │   │   └── popup/                 # Extension popup
│   │   ├── lib/                       # Banner client, results reader, storage, messaging
│   │   └── hooks/                     # React hooks shared by the popup and overlay
│   │
│   ├── api/           # API server (FastAPI + Python 3.14)
│   │   └── app/
│   │       ├── api/                   # App router & shared route dependencies
│   │       ├── modules/               # Per-feature routers, services, schemas, external clients
│   │       ├── core/                  # Config, database, security, errors, OpenAPI
│   │       └── shared/                # Cross-cutting schemas
│   │
│   ├── ellucian-api/  # Mock Ellucian SSB API (FastAPI), for development
│   └── seat-tracker/  # Standalone seat watcher (ntfy), separate from the app
│
└── packages/
    ├── api-client/    # TypeScript client generated from the API's OpenAPI schema (Hey API)
    ├── shared/        # Banner and local-store types and pure domain logic, with Vitest tests
    └── ui/            # shadcn/ui (Base UI) components, product components and the Tailwind theme
```

### How It Works

1. **Website** — Where students do the real work: search, schedule builder, planner, audit, transcript, advisor, auto-register setup and settings. Guests use all of it; data is saved in the browser (IndexedDB), or in the extension once it's installed.
2. **Popup** — Quick access while on Banner: first run (pick a school), then Today (armed countdown, this tab and the Banner overlay switch, the term's plan with live seats), Search (sections with ratings and seats, add to plan), Register (the queue and last run; arming happens on the website) and Audit (summary, what's still needed, re-run in DARS). Deeper tasks open the website.
3. **Content Script** — Runs only on Banner URLs (`*://*.edu/StudentRegistrationSsb/*`, `*://*.edu/ssb/*`). It makes the Banner calls that must run in a signed-in Banner tab (registration terms and plans, CRN checks, the auto-register submit) and hosts the Banner overlay. The overlay reads Banner's class search results grid (Browse Classes, Plan Ahead, Find Classes) and adds a Rate My Professors score before each instructor, a seat meter under Banner's seat text, "In your plan" and "Conflicts with your plan" tags under titles, and a collapsible plan dock. Each piece renders in its own shadow root, so Banner's styles and ours never mix; one setting ("On Banner pages" on the website, or the switch on the popup's Today tab) turns all of it off.
4. **Web bridge** — A content script on the website's origin that passes a fixed list of requests between the page and the extension (`packages/shared/src/lib/bridge.ts`): the shared store, Banner status, DARS runs, the auto-register queue and arming, and Banner registration terms and plans. Anything else is dropped. Its `matches` are `localhost` only until the production origin is set.
5. **Background Service Worker** — Rating lookups for the Banner overlay, `SSB_*` messages forwarded to an open Banner tab, DARS runs, Banner connection status, auto-register (queue, arming checks, the one-shot alarm, notifications) and `chrome.storage`.
6. **Backend API** — A proxy for Banner's public class search (terms, subjects, sections; cached in Redis), Rate My Professors lookups, schedule generation, DARS audit and transcript parsing, and the advisor chat.

**Local-first data.** Settings, plans per term, the stored audit and transcript, and advisor threads are documents in one store (`packages/shared/src/types/store.ts`). The website keeps them in IndexedDB; with the extension installed, `chrome.storage.local` is the single copy, which the website reaches through the bridge (anything saved locally first is merged in once). The popup and the overlay read the same documents.

**Where each feature lives**

| Feature | Website | Popup | Content (Banner) |
| --- | --- | --- | --- |
| School and term | Yes | First run | |
| Search, schedule builder, planner | Yes | Search, plan | |
| Degree audit, transcript, advisor | Yes | Audit summary | DARS run |
| Auto-register | Set up and arm | Status, disarm | Submits the batch |
| Ratings, seats and plan tags on Banner pages | On/off setting | On/off switch | Yes |

## Tech Stack

| Layer | Technology |
|---|---|
| Extension Framework | [WXT](https://wxt.dev) v0.21 |
| UI | React 19, TypeScript, Tailwind CSS 4, shadcn/ui on Base UI |
| State | Local-first store: IndexedDB on the website, `chrome.storage.local` in the extension, shared through the web bridge; TanStack Query for API data |
| Backend | FastAPI, Python 3.14 |
| Database | PostgreSQL 18 (Docker), SQLAlchemy 2 |
| Cache | Redis 8 (Docker), short-lived data only |
| Auth | Google OAuth 2.0 / OpenID Connect (Authlib), server-side sessions |
| AI / LLM | OpenAI API |
| RMP Data | Rate My Professor GraphQL API |

## Getting Started

### Prerequisites

- **Node.js** ≥ 24 and **pnpm** ≥ 9
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
pnpm test    # pytest + Vitest
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
- **Type safety** — API types come from the generated `@workspace/api-client` (see API Client); Banner and local-store types live in `@workspace/shared`.

## API Client

The web app and the extension call the API through `@workspace/api-client`, generated by [Hey API](https://heyapi.dev) (`@hey-api/openapi-ts`) from `apps/api/openapi.json`: TypeScript types for every schema, a Fetch SDK (`listTerms()`, `searchSections()`…) and TanStack Query options (`@workspace/api-client/query`). Don't edit `packages/api-client/src/generated`.

After changing an endpoint or schema in `apps/api`:

```bash
pnpm api:generate   # writes apps/api/openapi.json, then regenerates the client from it
```

Commit both. CI fails if either is out of date, and `apps/api` has a test that fails when `openapi.json` doesn't match the code. Operation IDs are the route function names, so renaming a route function renames its SDK function. Errors come back as RFC 9457 problem details; the client turns them into `ApiError` (with `status` and a `message` safe to show) or `NetworkError`.

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

The website and the extension run as guests today: account sync is a later phase, so neither shows a sign-in button yet. The endpoints above and `apps/web/src/lib/auth.ts` stay in place for it. When sign-in is added, both clients will go through the backend and never talk to Google or hold a token: the website links to `/api/auth/google/login` and reads `/api/auth/me`; the extension's requests use `credentials: "include"`, and its host permission for the API lets the same session cookie through.

The extension reads its config at build time. Copy `apps/extension/.env.example` to `apps/extension/.env` (or `.env.production` for release builds):

```env
WXT_API_ORIGIN=http://localhost:8000   # Backend API origin; paths start with /api
WXT_WEB_ORIGIN=http://localhost:5173   # The website, opened from the popup and the plan dock
WXT_BANNER_REGISTRATION_URL=...        # Optional; defaults to Temple's Banner registration page
```

The website reads `VITE_BANNER_REGISTRATION_URL` and `VITE_EXTENSION_INSTALL_URL` the same way (see `apps/web/.env.example`).

## Contributing

1. Fork the repo and create a feature branch.
2. Follow the existing code style — Prettier + ESLint for TS, Ruff for Python.
3. Write tests for new services.
4. Open a PR with a clear description.

## License

MIT
