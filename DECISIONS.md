# Decision Log

SleekFlow Software Engineer Interview Project — 1–2 page decision record (deliverable).

## How I interpreted ambiguous / underspecified requirements

1. **“Custom” recurrence**  
   Interpreted as *every N days / weeks / months*, not full RFC 5545 RRULE. Covers real scheduling without calendar-rule complexity.

2. **Next occurrence timing**  
   Computed from the *scheduled due date*, not “now”, so early/late completion does not drift the cadence.

3. **“Data should not be permanently lost when deleted”**  
   Soft delete via `deletedAt`, with Trash + Restore. `ARCHIVED` is a normal visible status and is distinct from deleted.

4. **“Multiple users accessing the same TODO list concurrently”**  
   Interpreted as a **shared board** (anonymous-writable) plus optimistic concurrency (`version` → `409`), transactions, and idempotent next-occurrence creation (`previousOccurrenceId` unique). Auth was layered later without removing the shared-board concurrency story.

5. **“10,000+ items without degrading UX”**  
   SQL pagination (offset + keyset `cursor`), ranked sorts for priority/status/dependency, dashboard `groupBy`/counts, date-bounded calendar. Verified with `npm run verify:scale` and `npm run verify:query-budgets`—not by shipping 10k rows in the demo seed.

6. **Blocked / unblocked**  
   Blocked when any non-deleted dependency is not `COMPLETED`.

7. **Prioritization under intentional over-scope**  
   Core correctness (CRUD, recurrence, dependencies, filters/sorts, soft delete, concurrency, scale-safe queries, tests, docs) first; nice-to-haves second at interview-complete depth.

## Key architectural decisions and trade-offs

| Choice | Why | Trade-off |
|---|---|---|
| Next.js Route Handlers | One TypeScript process, clear REST surface for demo | Less “classic microservice” separation |
| Domain services outside handlers | Testable business rules; thin routes | More files than logic-in-routes |
| PostgreSQL + Prisma | Transactions, indexes, migrations | ORM vs hand-tuned SQL everywhere |
| Soft delete + `version` | Retention + concurrent edit safety | Lists must filter `deletedAt` |
| Zod validation | Shared typed request validation | Schema maintenance |
| Cookie sessions + bcrypt | Auth/registration without OAuth surface | No SSO / password reset |
| `Todo.ownerId` ON DELETE CASCADE | Deleting a user removes private todos instead of promoting them to the shared board (`ownerId IS NULL`) | Shared-board todos are unaffected (already null owner) |
| Outbox + SSE | Realtime tab sync without WebSocket infra | ~1.5s poll latency; outbox pruned after 1 day |
| Custom SVG dependency graph | Interactive deps without React Flow weight | Simple grid layout, not force-directed |
| Docker Compose `app`+`postgres` | One-command interview demo | Host port `3005` to avoid local `:3000` clashes |
| Scalar over Swagger UI | Modern reference UI + built-in try-it client; drops React 19 peer warnings | Less ubiquitous than Swagger; weaker legacy OAuth-flow UI |

## What I chose NOT to build (and why)

- **OAuth / NextAuth / SSO** — nice-to-have auth is already demonstrated with email/password + sessions; SSO adds product surface without proving more domain correctness.
- **WebSockets / Redis pub-sub** — outbox + SSE already covers “realtime updates across tabs”; WS adds ops complexity for this assessment.
- **Hard multi-tenant ACL** — PDF concurrency is about the *same* shared list; owner vs shared is enough ownership story.
- **React Flow / permanent delete / password reset** — polish and product features outside the evaluation core.

## What I would do differently / with more time

1. Cursor-first UI pagination (the Tasks UI still uses offset `page`; the API already supports keyset).
2. Stronger auth hardening (CSRF strategy for cookie mutations, rate limits, email verification).
3. True push fan-out (LISTEN/NOTIFY or Redis) instead of SSE polling the outbox.
4. Force-directed or layered graph layout, plus cycle visualisation in the graph UI.
5. Broader E2E matrix (bulk partial failure, forbidden ownership paths, SSE assertions).
6. Tighter EXPLAIN budgets with baseline snapshots committed to the repo.

## Extra features kept for demo value

Search, restore, dashboard/charts, calendar, table+kanban, Scalar API docs, Docker+CI, auth/shared board, bulk ops, dependency graph, cursor API, outbox/SSE, query budgets.

## AI tooling note

Cursor assisted implementation speed. Ambiguity resolutions, prioritization, and trade-offs are treated as first-class interview artifacts (this file + README).
