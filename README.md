# HealthGuard AI

AI-powered preventive health monitoring platform. Track vitals in real time, receive intelligent alerts, chat with an AI health assistant, assess risk scores, and manage wearable devices — all from a single dashboard.

## Features

- **Real-time Dashboard** — Live vital signs (HR, BP, glucose, SpO2, temperature, sleep, steps) with trend indicators and device source badges, updated via Socket.io
- **AI Health Assistant** — Conversational chat with streaming responses, full context awareness of your vitals, risk score, alerts, and profile
- **Smart Alerts** — Threshold-based alert engine with AI-generated patient-friendly messages and emergency context for critical events
- **Risk Scoring** — Points-based health risk score (0-100) weighted by chronic conditions, with AI-generated predictions and recommendations
- **Wearable Devices** — Simulated device connections (Apple Watch, Fitbit, WHOOP, Oura Ring, Dexcom G7, Garmin) with real-time sync status and vitals ingestion
- **Vitals Tracking** — Detailed per-vital charts, quick-log from the vitals page, full multi-vital logging modal, normal range overlays
- **Profile Management** — Personal info, chronic conditions, medications, emergency contacts, alert preferences, custom normal range overrides
- **Guided Demo Mode** — 7-step interactive walkthrough with a pre-built patient profile, simulated device connections, vital spikes, and AI analysis
- **Auth0 Authentication** — Optional Auth0 integration; runs in open dev mode when credentials are not configured

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 18, React Router v6, Tailwind CSS v4, Vite, Recharts, Lucide React, Axios, Socket.io Client |
| Backend | Node.js, Express, Socket.io, better-sqlite3 (WAL mode), express-rate-limit |
| AI | OpenAI SDK pointed at [Featherless AI](https://featherless.ai) (DeepSeek-V3) |
| Auth | Auth0 (optional) via `@auth0/auth0-react` + `express-oauth2-jwt-bearer` |

## Quick Start

```bash
# Clone the repo
git clone https://github.com/ZubayrBaig/HealthGuard-AI.git
cd HealthGuard-AI

# Install dependencies
npm install --prefix client && npm install --prefix server

# Configure environment
cp .env.example .env
# Edit .env and add your FEATHERLESS_API_KEY

# Start development (client on :5173, server on :3001)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and click **Try Demo** to explore with sample data.

## Environment Variables

Create a `.env` file in the project root (see `.env.example`):

| Variable | Required | Description |
|----------|----------|-------------|
| `FEATHERLESS_API_KEY` | Yes | API key for Featherless AI |
| `FEATHERLESS_BASE_URL` | Yes | `https://api.featherless.ai/v1` |
| `FEATHERLESS_MODEL` | Yes | Model ID (e.g. `deepseek-ai/DeepSeek-V3-0324`) |
| `PORT` | No | Server port (default: 3001) |
| `AUTH0_DOMAIN` | No | Auth0 tenant domain |
| `AUTH0_AUDIENCE` | No | Auth0 API audience identifier |
| `AUTH0_CLIENT_ID` | No | Auth0 application client ID |
| `VITE_AUTH0_DOMAIN` | No | Same as `AUTH0_DOMAIN` (exposed to client) |
| `VITE_AUTH0_CLIENT_ID` | No | Same as `AUTH0_CLIENT_ID` (exposed to client) |
| `VITE_AUTH0_AUDIENCE` | No | Same as `AUTH0_AUDIENCE` (exposed to client) |

Auth0 variables are optional. When left blank, the app runs in unauthenticated dev mode with full access.

## Project Structure

```
HealthGuard AI/
├── client/                  # React + Vite frontend
│   └── src/
│       ├── pages/           # Dashboard, Vitals, Chat, Alerts, Devices, Profile, Login
│       ├── components/      # Shared UI (Layout, StatCard, RiskGauge, Charts, etc.)
│       ├── context/         # AuthContext, NotificationContext, ToastContext
│       └── utils/           # Axios instance with auth interceptor
├── server/                  # Express + Node.js backend
│   ├── index.js             # Entry point (Express + Socket.io on same HTTP server)
│   ├── db/                  # SQLite database + schema + seed data
│   ├── routes/              # API routes (vitals, patients, alerts, risk, chat, devices, auth, demo)
│   ├── services/            # AI integration, alert engine, risk engine, vital simulator, device config
│   └── middleware/          # Auth middleware (JWT validation / passthrough)
├── .env                     # Environment variables (not committed)
├── .env.example             # Template
└── package.json             # Root orchestrator (concurrently)
```

## Scripts

```bash
npm run dev            # Run client + server concurrently
npm run dev:client     # Vite dev server only (port 5173)
npm run dev:server     # Express server only (port 3001, --watch)
npm run build          # Install deps + build client for production
npm start              # Start production server
```

## API Overview

All endpoints are prefixed with `/api`. Demo routes (`/api/demo/*`) are unauthenticated; all others require a valid token (or passthrough in dev mode).

| Route | Description |
|-------|-------------|
| `GET /api/health` | Health check |
| `POST /api/demo/seed` | Seed demo patient + 30 days of data |
| `POST /api/demo/step/:n` | Execute guided demo step (1-7) |
| `POST /api/auth/link-patient` | Link Auth0 user to patient record |
| `GET /api/patients` | List patients |
| `PUT /api/patients/:id` | Update patient profile |
| `GET /api/vitals/:patientId/latest` | Latest vital reading |
| `GET /api/vitals/:patientId/summary` | Aggregated stats (min/max/avg/trend) |
| `POST /api/vitals/:patientId` | Log new vitals |
| `GET /api/alerts/:patientId` | Paginated, filterable alerts |
| `PATCH /api/alerts/:id/acknowledge` | Acknowledge an alert |
| `GET /api/risk/:patientId/score` | Rule-based risk score |
| `GET /api/risk/:patientId/insights` | AI-generated risk predictions |
| `POST /api/chat/:patientId` | Send chat message (SSE stream response) |
| `GET /api/devices/supported` | Device catalog |
| `POST /api/devices/:patientId/connect` | Connect a wearable device |

## Production Deployment

The server serves the built client in production mode:

```bash
npm run build          # Installs deps + builds client/dist
NODE_ENV=production npm start
```

When `NODE_ENV=production` and `client/dist` exists, the server serves static files and falls back to `index.html` for client-side routing. CORS middleware is disabled (same-origin). Compatible with platforms like Railway — set `PORT` via environment.

## License

MIT
