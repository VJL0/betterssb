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
│   │   │   └── modules/           # Feature modules toggled independently
│   │   ├── popup/                 # Extension popup (quick actions)
│   │   └── sidepanel/             # Side panel (planner, chatbot)
│   ├── components/                # Shared React components
│   ├── lib/                       # API client, storage, messaging helpers
│   ├── hooks/                     # Custom React hooks
│   └── types/                     # Shared TypeScript types
│
├── backend/           # API server (FastAPI + Python 3.14)
│   └── app/
│       ├── api/routes/            # REST endpoints by domain
│       ├── models/                # Pydantic schemas
│       ├── services/              # Business logic & external integrations
│       └── core/                  # Config, middleware, deps
```

### How It Works

1. **Content Script** — Runs on Banner pages (`*://*.edu/StudentRegistrationSsb/*`). Observes the DOM, injects React components (ratings badges, UI improvements), and exposes hooks for auto-registration.
2. **Popup / Side Panel** — Provides the schedule builder, semester planner, chatbot, and transcript upload outside the Banner DOM.
3. **Background Service Worker** — Bridges the content script and popup with the backend API. Manages alarms for registration windows and caches data in `chrome.storage`.
4. **Backend API** — Handles heavy lifting: Rate My Professor lookups, schedule optimization (constraint solver), transcript parsing, chatbot inference, and prerequisite validation.

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
- **Type safety** — Shared types in `frontend/types/` keep content scripts, popup, side panel, and API calls in sync.

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
