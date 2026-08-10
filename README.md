# SleekFlow TODO Workspace

Interview coding assessment for SleekFlow: a TODO list web app with a REST API, PostgreSQL persistence, recurrence, dependencies, filtering/sorting, soft delete, and a responsive demo UI.

## Stack

- **Next.js 16** (App Router + Route Handlers)
- **TypeScript**
- **PostgreSQL 16** (Docker Compose)
- **Prisma 7**
- **Zod** validation
- **TanStack Query**, **Recharts**, **FullCalendar**
- **Vitest** (unit + integration), **Playwright** (E2E)

## Why this stack

One TypeScript language across API, UI, and shared validation keeps the demo easy to explain. Next.js Route Handlers avoid a second process while still exposing a clear REST surface. PostgreSQL + Prisma give indexed queries, transactions for concurrent completion, and soft-delete retention.

## Quickest path: `docker compose up`

Requires Docker Desktop only (no local Node needed for the demo):

```bash
cd sleekflow-todo
docker compose up --build
```

Or detached:

```bash
docker compose up --build -d
```

Open **[http://localhost:3005](http://localhost:3005)** (host port `3005` avoids clashing with other local apps on `3000`).

That single command starts Postgres + the Next.js app. The app container waits for Postgres, runs migrations, seeds **2 shared demo todos** (+ Alice-owned sample when empty), then serves the UI.

```bash
npm run docker:up     # same as: docker compose up --build -d
npm run docker:logs   # follow app logs
npm run docker:down   # stop stack
```

## Local development (optional Node + Docker DB)

Use this only when you want hot reload with `npm run dev` on the host. Create `.env.local` with localhost DB ports (see `.env.example`). Host Node is **not** required for the Docker demo path above.

### Prerequisites

- Node.js 20+
- Docker Desktop
- npm

### Setup

```bash
cp .env.example .env
npm install
npm run setup
npm run dev
```

Or step-by-step:

```bash
npm run db:up
npm run db:up:test
npx wait-on tcp:5433 tcp:5434
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Default seed creates:

1. `Prepare interview notes` (shared, in progress, high priority)
2. `Weekly project status check-in` (shared, recurring weekly, depends on #1, blocked until #1 is completed)
3. `Alice private follow-up` (owned; visible after login as Alice)

Demo users: `alice@example.com` / `bob@example.com` password `demo1234`.

### Useful commands

| Command | Purpose |
|---|---|
| `npm run docker:up` | `docker compose up --build -d` (app + Postgres) |
| `npm run docker:down` | Stop Docker stack |
| `npm run docker:logs` | Tail app container logs |
| `npm run db:up` | Start Postgres only for local Node (`:5433`) |
| `npm run db:up:test` | Start isolated test Postgres (`:5434`) |
| `npm run db:seed` | Reset seed data (shared todos + demo users) |
| `npm run setup` | DB up + migrate + seed |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit + integration tests |
| `npm run test:e2e` | Playwright demo + conflict/cycle specs |
| `npm run verify:scale` | Insert 10k rows, exercise list/dashboard queries, clean up |
| `npm run verify:query-budgets` | EXPLAIN ANALYZE soft budgets for list/dashboard SQL |
| `npm run build` | Production build |

## API overview

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/register` | Create account + session cookie |
| `POST` | `/api/auth/login` | Login + session cookie |
| `POST` | `/api/auth/logout` | Clear session |
| `GET` | `/api/auth/me` | Current user or `null` |
| `GET` | `/api/todos` | Filter, sort, offset `page` and/or keyset `cursor` |
| `POST` | `/api/todos` | Create (`sharedBoard` default true) |
| `POST` | `/api/todos/bulk` | Bulk complete / softDelete / restore / setStatus |
| `GET` | `/api/todos/graph` | Nodes + edges for dependency graph |
| `GET` | `/api/todos/:id` | Read |
| `PATCH` | `/api/todos/:id` | Update (requires `version`) |
| `DELETE` | `/api/todos/:id` | Soft delete |
| `POST` | `/api/todos/:id/restore` | Restore |
| `GET` | `/api/dashboard` | Aggregates + upcoming |
| `GET` | `/api/calendar?start=&end=` | Due-date range |
| `GET` | `/api/events` | SSE outbox stream |
| `GET` | `/api/openapi` | OpenAPI JSON |

Interactive docs: [http://localhost:3000/docs](http://localhost:3000/docs) (Docker demo: port **3005**).

Demo users after seed: `alice@example.com` / `bob@example.com` password `demo1234`.

### Example: create a recurring todo

```bash
curl -X POST http://localhost:3000/api/todos ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Daily review\",\"dueDate\":\"2026-08-11\",\"isRecurring\":true,\"recurrenceFrequency\":\"DAILY\",\"priority\":\"MEDIUM\",\"sharedBoard\":true}"
```

## Requirement coverage

| Requirement | Status |
|---|---|
| CRUD with id, name, description, due date, status, priority | Done |
| Recurring daily/weekly/monthly/custom (every N units) | Done |
| Next occurrence created on complete | Done |
| Dependencies + block In Progress | Done |
| Filter by status, priority, due date, blocked/unblocked | Done |
| Sort by due date, priority, status, name | Done |
| Functional web UI | Done (dashboard, table/kanban, calendar, trash, graph) |
| Concurrent access safety | Done (transactions + version conflicts) |
| Soft delete (no permanent loss) | Done |
| 10,000+ items without UX collapse | Done (SQL pagination/keyset + aggregates + scale/budget scripts) |
| Auth + shared board | Done |
| Realtime multi-tab refresh | Done (outbox + SSE) |
| Bulk operations | Done |
| Interactive dependency graph | Done |
| Tests | Done (unit + integration + E2E conflict/cycle) |
| API docs | Done (OpenAPI + Scalar) |
| Decision log | [`DECISIONS.md`](./DECISIONS.md) |
| Architecture diagram | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| Docker one-command demo | Done (`postgres` + `app`) |

### Intentionally still out of scope

- OAuth / NextAuth / SSO
- WebSockets / Redis
- Hard multi-tenant ACL beyond owner vs shared
- React Flow / permanent delete

## Thought process (deferred → shipped)

These items started in [`DECISIONS.md`](./DECISIONS.md) as “not built” / “with more time”. They were deferred first so the assessment could prove the hard core (recurrence, dependencies, concurrency, soft delete, scale-safe queries) without diluting the narrative. This follow-up ships them at **interview-complete** depth: real, demoable, explainable—not production OAuth/WebSocket machinery.

### Why defer originally

- **Auth** — shared-list optimistic concurrency already showed the correctness story; auth without ownership rules is theatre.
- **Realtime** — polling + clear `409` messages were enough to explain multi-user edits in a short window.
- **Bulk** — orthogonal to recurrence/dependency rules; easy to bolt on once single-todo paths were solid.
- **Interactive graph** — dependency health chart already communicated product insight; a node graph was UI risk.
- **Cursor pagination / EXPLAIN budgets / extra E2E** — offset pages + scale script were enough for the first cut.

### Why ship them now (and how)

1. **Auth + ownership**  
   Cookie session + bcrypt keeps the surface small. `ownerId = null` means **shared board** (still writable anonymously, preserving the original concurrency demo). Signed-in users see shared + own. Owned writes require the owner. Seed users Alice/Bob make the demo one click.

2. **Outbox + SSE (not WebSockets)**  
   Mutations insert `OutboxEvent` in the **same transaction** as the todo write, so clients never see “data committed, event lost”. `/api/events` is SSE that polls the outbox after the last id. The UI only invalidates TanStack Query keys—no second source of truth. Trade-off: ~1.5s latency vs a dedicated WS fan-out.

3. **Bulk operations**  
   `POST /api/todos/bulk` loops the existing service methods so blocked/`version`/ownership rules stay identical. Partial failures return per-id errors instead of inventing a second permission model.

4. **Interactive dependency graph**  
   Custom SVG (~pan/zoom/click) avoids React Flow weight. Layout is a simple grid—good enough to explain edges prerequisite → dependent in an interview.

5. **Cursor + offset coexistence**  
   The Tasks UI still uses `page`. APIs also return `nextCursor` and accept `cursor` for keyset pagination (including ranked priority/status/dependency sorts). That is the path for very large lists without deep `OFFSET`.

6. **Stronger E2E**  
   Dedicated Playwright specs for stale `version` → `409` and dependency cycle → `400`, so the edge cases are not only in Vitest.

7. **EXPLAIN ANALYZE budgets**  
   `verify:query-budgets` inserts a few hundred rows, runs `EXPLAIN (ANALYZE, BUFFERS)` on list/dashboard-shaped SQL, and fails CI only on soft ceilings (planning ≤ 500ms, execution ≤ 2500ms). Thresholds are loose on purpose: catch catastrophes, not CI host noise.

## Interview demo script

1. Open Dashboard → show KPIs, charts, dependency health, upcoming table.
2. Open Tasks → show the blocked weekly check-in; try multi-select bulk actions.
3. Try moving the weekly task to In Progress → expect `409` blocked error.
4. Complete “Prepare interview notes” (second browser/tab should refresh via SSE).
5. Start and complete the weekly recurring task → next weekly occurrence appears.
6. Log in as Alice → see shared todos plus “Alice private follow-up”.
7. Open Graph → pan/zoom, click a node into Tasks.
8. Soft delete a todo → restore it from Trash (or bulk restore).
9. Open API Docs → walk a request in Scalar.

## Project layout

```text
src/
  app/                # pages + API route handlers
  features/auth/      # session cookie auth + shell controls
  features/todos/     # schemas, domain, repository, service, UI
  components/         # shell + providers
  lib/                # prisma, api helpers, openapi
prisma/               # schema, migrations, seed
docker/               # container entrypoint
tests/                # unit + integration + e2e
scripts/              # scale + query-budget verification
docs/                 # architecture notes
```

## Environment notes

- [`.env`](./.env) uses **Docker Compose service DNS** (`postgres`, `postgres-test`) for the app container.
- [`.env.local`](./.env.local) overrides with **localhost published ports** (`:5433`, `:5434`) for host-side `npm run dev` / Prisma / Vitest.
- Copy from `.env.example`, then keep both files as documented there.
- Postgres data is bind-mounted to [`docker-data/`](./docker-data/) on the host (not anonymous Docker volumes).
- Compose hardcodes in-container `DATABASE_URL` to `postgres:5432` so a host-shell `DATABASE_URL` cannot break the app container.

## Interview evaluation map (from the PDF)

What they say they evaluate → how this repo answers it:

| Evaluation axis | Where to point in the demo / repo |
|---|---|
| Requirement interpretation | [`DECISIONS.md`](./DECISIONS.md) ambiguities (custom recurrence, soft delete vs archive, shared concurrent list, 10k UX) |
| Planning / prioritization | Core first, then nice-to-haves; “NOT to build” + “more time” sections |
| Technical decisions / trade-offs | Architecture table in DECISIONS + [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| Code quality | `src/features/todos/*` service/repository split; Zod at the edge |
| Verification / edge cases | Vitest unit+integration; Playwright demo + conflict/cycle; `verify:scale` / `verify:query-budgets` |
| Communication | This README + decision log + live demo script below |

### Likely discussion prompts (prepare answers)

1. **How did you interpret “custom” recurrence?** — every N days/weeks/months; due-date based next occurrence.
2. **How do you handle concurrent edits on one list?** — shared board + `version` optimistic lock + unique next-occurrence link.
3. **How is delete not permanent?** — `deletedAt`, Trash, restore; archive ≠ delete.
4. **How does 10k not melt the UI?** — SQL page/keyset, aggregates, scale + EXPLAIN scripts (not loading all rows).
5. **Why Next.js Route Handlers instead of Express?** — one process/language for interview speed; domain still testable outside handlers.
6. **What did you skip and why?** — OAuth/WS/hard ACL; see DECISIONS “NOT to build”.
7. **Walk me through completing a recurring blocked task.** — demo script steps 2–5.
8. **Did you use AI?** — yes (Cursor); decisions and prioritization are ours; transcripts optional and not required.

## AI assistance disclosure

Cursor was used as a coding assistant for scaffolding, boilerplate, and iteration. Design choices, prioritization, and the decision log remain intentional and reviewable. Raw AI transcripts are not included in this repository.
