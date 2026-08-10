# SleekFlow TODO Workspace

Interview assessment for SleekFlow: a TODO app with a REST API, PostgreSQL persistence, recurring tasks, dependencies, filtering and sorting, soft delete, and a demo web UI.

Deliverables: this README, the decision log in [`DECISIONS.md`](./DECISIONS.md), and diagrams in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Run it

Docker Desktop is the only requirement.

```bash
docker compose up --build
```

Then open **[http://localhost:3005](http://localhost:3005)**.

That one command starts PostgreSQL and the app. The app waits for the database, applies migrations, and seeds demo data on first run. Port `3005` is used so the demo cannot clash with anything already running on `3000`. Stop it with `Ctrl+C`, or `docker compose down`.

### Demo data

| Todo | Notes |
|---|---|
| Prepare interview notes | Shared, in progress, high priority |
| Weekly project status check-in | Shared, recurring weekly, blocked until the note above is completed |
| Alice private follow-up | Private, visible only after logging in as Alice |

Logins: `alice@example.com` or `bob@example.com`, password `demo1234`.

## Two-minute tour

1. **Dashboard** — KPIs, status and priority charts, dependency health, upcoming tasks.
2. **Tasks** — move the weekly check-in to In Progress and it is rejected with `409`, because its prerequisite is not complete.
3. Complete *Prepare interview notes*, then complete the weekly task. Next week's occurrence is created automatically.
4. Log in as Alice to see her private todo alongside the shared board. Open a second tab and edit something to watch both refresh live.
5. **Graph** — pan and zoom the dependency graph, click a node to jump to that task.
6. **Trash** — delete a todo and restore it; nothing is ever permanently lost.
7. **API Docs** — `/docs` renders the OpenAPI spec with a built-in try-it client.

## Stack

Next.js 16 (App Router and Route Handlers), TypeScript, PostgreSQL 16, Prisma 7, Zod, TanStack Query, Recharts, FullCalendar, Vitest, Playwright.

One language across the API, UI, and validation keeps the project quick to explain. Route Handlers give a plain REST surface without running a second process. PostgreSQL and Prisma supply the transactions, indexes, and migrations that the concurrency and 10k-item requirements need.

## API

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/register` | Create account, set session cookie |
| `POST` | `/api/auth/login` | Log in, set session cookie |
| `POST` | `/api/auth/logout` | Clear session |
| `GET` | `/api/auth/me` | Current user, or `null` |
| `GET` | `/api/todos` | Filter, sort, offset `page` and/or keyset `cursor` |
| `POST` | `/api/todos` | Create (`sharedBoard` defaults to true) |
| `POST` | `/api/todos/bulk` | Bulk complete, soft delete, restore, or set status |
| `GET` | `/api/todos/graph` | Nodes and edges for the dependency graph |
| `GET` | `/api/todos/:id` | Read one |
| `PATCH` | `/api/todos/:id` | Update, requires `version` |
| `DELETE` | `/api/todos/:id` | Soft delete |
| `POST` | `/api/todos/:id/restore` | Restore |
| `GET` | `/api/dashboard` | Aggregates and upcoming tasks |
| `GET` | `/api/calendar?start=&end=` | Due dates in a range |
| `GET` | `/api/events` | Server-sent event stream for live refresh |
| `GET` | `/api/openapi` | OpenAPI JSON |

Interactive docs: **[http://localhost:3005/docs](http://localhost:3005/docs)**.

```bash
curl -X POST http://localhost:3005/api/todos \
  -H "Content-Type: application/json" \
  -d '{"name":"Daily review","dueDate":"2026-08-11","isRecurring":true,"recurrenceFrequency":"DAILY","priority":"MEDIUM","sharedBoard":true}'
```

## Requirement coverage

| Requirement | How it is met |
|---|---|
| CRUD with id, name, description, due date, status, priority | Done |
| Recurring daily, weekly, monthly, or every N units | Done |
| Next occurrence created on completion | Done, idempotent via a unique `previousOccurrenceId` |
| Dependencies that block In Progress | Done, returns `409` |
| Filter by status, priority, due date, blocked state | Done |
| Sort by due date, priority, status, name | Done |
| Functional web UI | Dashboard, table, kanban, calendar, trash, graph |
| Safe concurrent access | Transactions plus `version` optimistic locking |
| Deleted data is never lost | Soft delete with `deletedAt`, plus Trash and restore |
| 10,000+ items without UX collapse | SQL pagination and keyset cursors, aggregate queries, verified by scripts |
| Auth and a shared board | Cookie sessions; `ownerId = null` means shared |
| Live multi-tab refresh | Transactional outbox plus server-sent events |
| Bulk operations | `POST /api/todos/bulk` with per-item errors |
| Interactive dependency graph | Custom SVG with pan, zoom, and click-through |
| Tests | Unit, integration, and end-to-end |
| API documentation | OpenAPI spec rendered by Scalar |

What was deliberately left out, and why, is in [`DECISIONS.md`](./DECISIONS.md).

## How I approached it

The brief is intentionally over-scoped, so I built the hard correctness core first: recurrence, dependencies, concurrency, soft delete, and queries that stay fast at 10k rows. Everything that could be demonstrated by a chart or an error message instead of new infrastructure was deferred until that core was solid and tested.

The deferred items were then added at interview depth rather than production depth:

- **Auth** is a cookie session with bcrypt. `ownerId = null` keeps the shared board anonymously writable, so the original concurrency demo still works, while signed-in users additionally see and own private todos.
- **Live updates** use a transactional outbox instead of WebSockets. Each mutation writes its event in the same transaction as the data, so a committed change can never lose its event. Clients only invalidate query caches, so there is no second source of truth. The trade-off is roughly 1.5 seconds of latency.
- **Bulk actions** reuse the single-item service methods, so blocking, versioning, and ownership rules cannot drift. Partial failures come back per id.
- **The dependency graph** is hand-rolled SVG rather than React Flow, which keeps the bundle small at the cost of a simple grid layout.
- **Keyset pagination** exists alongside offset pages, including for ranked priority, status, and dependency sorts. That is the path for very large lists without a deep `OFFSET`.

## Verification

Every push runs lint, type checking, unit and integration tests, `EXPLAIN ANALYZE` query budgets, and a production build in [GitHub Actions](./.github/workflows/ci.yml). Playwright covers the demo flow plus the version-conflict and dependency-cycle edge cases. A scale script inserts 10,000 rows, times the real list and dashboard queries, then cleans up after itself.

## Layout

```text
src/app/          pages and API route handlers
src/features/     auth and todo domain: schemas, rules, repository, service, UI
src/lib/          Prisma client, API helpers, OpenAPI document
prisma/           schema, migrations, seed
tests/            unit, integration, end-to-end
scripts/          scale and query-budget verification
docs/             architecture notes
```

No environment setup is needed for the Docker demo; Compose supplies its own defaults. [`.env.example`](./.env.example) documents the optional overrides.

## AI assistance

Cursor was used for scaffolding and iteration. The design choices, prioritisation, and the decision log are deliberate and reviewable.
