# Tennis

Node + TypeScript + React web app.

- `src/`: React app, built by Vite.
- `server/`: Node HTTP server (TypeScript, run with `tsx`). `/api/*` routes live in `server/routes/`, save rules in `server/services/`, page data in `server/views/`.
- `server/migrations/*.sql`: database updates, applied once each at start. `server/seeds/`: run-once samples.
- `data/` (not committed): `tennis.sqlite`, uploaded files, backups before each update.

Use `bun` for installs and scripts. Node runs the server.

| Command | What it does |
|---|---|
| `bun install` | Install dependencies (`bun.lock` is committed) |
| `bun run dev` | Dev server on `$PORT` (default 3000): API plus Vite with hot reload |
| `bun run build` | Type check, then build the React app into `dist/` |
| `bun run start` | Production server on `$PORT`: API plus `dist/` |
| `bun run test` | Tests (Vitest). Run only the touched files: `bun run test server/score.test.ts` |

## Начать

1. `bun install`.
2. `paneweb up`. Первый старт создаёт `data/tennis.sqlite` с образцами.
3. Войти образцом: `organizer` / `tennis-org`, `judge1` / `tennis-judge1`, `judge2` / `tennis-judge2`.

- Проверка за две минуты: окно шириной с телефон, вход `judge1`, отметить очко. На онлайн-счёте в другой вкладке оно появится в течение 10 секунд.
- Чистая база: `paneweb down`, `rm -rf data/`, `paneweb up`. Нужна:
  - после правки своего ещё не слитого файла обновления или образцов;
  - когда образцы устарели: их даты отсчитаны от дня первого запуска.
- Сервер вручную (`bun run dev`) не запускают.

## Документация

- [Урок: первый матч на тестовом сайте](docs/tutorial-test-site.md)
- [Как работать организатору и судье](docs/how-to-organizer-judge.md)
- [Справка](docs/reference-site.md)
- [Образцы, очки и рейтинг](docs/explanation-samples-and-scoring.md)
- [Изменения](CHANGELOG.md)
- Решения первой версии: `docs/designs/`

## Servers

- Dev: `paneweb up` in a worktree runs `.paneweb.json`.
- Staging: the board's staging keeper runs `.staging-site.json` from the `staging` branch and redeploys on each new commit. `/api/health` reports the deployed commit.
