# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Run both client and server concurrently
npm run dev

# Run individually
npm run dev:client    # Vite dev server on port 5173
npm run dev:server    # Express server on port 3001 (node --watch)

# Client build
npm run build --prefix client
npm run preview --prefix client
```

No test framework is configured yet.

## Architecture

This is a monorepo with two independent packages (`client/` and `server/`) orchestrated by a root package.json using `concurrently`. Each has its own `node_modules` — no npm workspaces.

### Client (React + Vite)

- React 18, React Router v6, Tailwind CSS v4 (via `@tailwindcss/vite` plugin — no tailwind.config or postcss.config)
- Vite proxies `/api` and `/socket.io` to the server at `localhost:3001` (see `client/vite.config.js`)
- Charting with Recharts, icons with Lucide React, dates with date-fns, HTTP with Axios

### Server (Express + Node.js)

- ES modules throughout (`"type": "module"`)
- Express with Socket.io attached to the same HTTP server (`server/index.js`)
- SQLite via better-sqlite3 with WAL mode (`server/db/database.js`)
- Rate limiting on all `/api/*` routes (100 req / 15 min)
- CORS locked to `http://localhost:5173`

### AI Integration

The `openai` npm package is configured to point at **Featherless AI** (not OpenAI). See `server/services/ai.js` — it reads `FEATHERLESS_BASE_URL` and `FEATHERLESS_API_KEY` from environment. The exported `chatCompletion(messages, options)` function uses `FEATHERLESS_MODEL`.

## Environment

The `.env` file lives at the project root. The server loads it via `dotenv.config({ path: join(__dirname, '..', '.env') })`. Copy `.env.example` to `.env` before running.

Key variables: `FEATHERLESS_API_KEY`, `FEATHERLESS_BASE_URL`, `FEATHERLESS_MODEL`, `PORT`.

## Conventions

- ESM imports only — use `fileURLToPath`/`dirname` pattern for `__dirname` in Node
- API routes are prefixed with `/api`
- Empty scaffold directories use `.gitkeep` files
