# Tennis

Node + TypeScript + React web app.

- `src/`: React app, built by Vite.
- `server/`: Node HTTP server (TypeScript, run with `tsx`). `/api/*` routes live in `server/api.ts`.

Use `bun` for installs and scripts. Node runs the server.

| Command | What it does |
|---|---|
| `bun install` | Install dependencies (`bun.lock` is committed) |
| `bun run dev` | Dev server on `$PORT` (default 3000): API plus Vite with hot reload |
| `bun run build` | Type check, then build the React app into `dist/` |
| `bun run start` | Production server on `$PORT`: API plus `dist/` |
| `bun run test` | Tests (Vitest) |

## Servers

- Dev: `paneweb up` in a worktree runs `.paneweb.json`.
- Staging: the board's staging keeper runs `.staging-site.json` from the `staging` branch and redeploys on each new commit. `/api/health` reports the deployed commit.
