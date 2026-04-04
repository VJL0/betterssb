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
├── frontend/          # Chrome extension (WXT + React + TypeScript)
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
│       ├── domains/               # Per-feature routers, services, Pydantic schemas
│       ├── integrations/          # External clients (OpenAI, Google, RMP)
│       ├── core/                  # Config, database, security
│       └── shared/                # Cross-cutting schemas & helpers
```

### How It Works

1. **Popup** — Primary UI: Google sign-in, school selection, schedule builder, semester planner, AI chat, transcript upload, and settings. Talks to the background worker and (for Banner data) to the content script via message passing.
2. **Content Script** — Runs only on Banner URLs (`*://*.edu/StudentRegistrationSsb/*`, `*://*.edu/ssb/*`). Handles anything that must execute in the page: calling Ellucian’s in-page APIs for the popup, injecting Rate My Professor badges on listings, and filling/submitting registration forms for auto-registration.
3. **Background Service Worker** — Relays non-SSB work to the backend (schedules, chat, transcript parsing, RMP search), forwards `SSB_*` messages to an open Banner tab, registration alarms, and `chrome.storage`.
4. **Backend API** — Rate My Professor lookups, schedule optimization, transcript parsing, chatbot inference, and prerequisite validation.

**Where each feature lives**

| Feature | Popup | Content |
| --- | --- | --- |
| Sign-in, school, settings | Yes | |
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
| Database | PostgreSQL 17 (Docker), SQLAlchemy 2 |
| Auth | Google Sign-In, JWT + refresh token rotation |
| AI / LLM | OpenAI API |
| RMP Data | Rate My Professor GraphQL API |

## Getting Started

### Prerequisites

- **Node.js** ≥ 20 and **pnpm** ≥ 9
- **Python** ≥ 3.14 and **uv** (Python package manager)
- **Docker** and **Docker Compose** (for PostgreSQL)
- A Chromium-based browser

### Database

```bash
docker compose up -d   # starts PostgreSQL on port 5432
```

### Frontend (Chrome Extension)

```bash
cd frontend
pnpm install
pnpm dev            # launches Chrome with the extension loaded
```

### Backend (API Server)

```bash
cd backend
cp .env.example .env  # then fill in your secrets
uv sync
uv run fastapi dev    # starts the dev server at http://localhost:8000
```

### Loading the Extension Manually

1. Run `pnpm build` in `frontend/`.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select `frontend/.output/chrome-mv3`.

## Development

- **Hot reload** — `pnpm dev` in the frontend watches for changes and reloads the extension automatically.
- **API docs** — Visit `http://localhost:8000/docs` for the interactive Swagger UI.
- **Type safety** — Shared types in `frontend/types/` keep content scripts, popup, and API calls in sync.

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

```env
DATABASE_URL=postgresql+asyncpg://betterssb:betterssb_dev@localhost:5432/betterssb
GOOGLE_CLIENT_ID=...           # Google Cloud Console → OAuth 2.0 Client ID
GOOGLE_CLIENT_SECRET=...       # Matching secret
JWT_SECRET=...                 # Random 64+ char string
OPENAI_API_KEY=sk-...          # Required for chatbot
RMP_AUTH_TOKEN=...              # Rate My Professor auth (optional, has fallback)
```

## Contributing

1. Fork the repo and create a feature branch.
2. Follow the existing code style — Prettier + ESLint for TS, Ruff for Python.
3. Write tests for new services.
4. Open a PR with a clear description.

## License

MIT
