# Architecture

## Component view

```mermaid
flowchart LR
    UI["React UI + TanStack Query"] --> RH["Next.js Route Handlers"]
    UI --> SSE["/api/events SSE"]
    RH --> Auth["Auth / session cookies"]
    RH --> Val["Zod schemas"]
    RH --> Svc["Todo + Auth services"]
    Svc --> Repo["Repositories"]
    Svc --> Rules["Recurrence + dependency rules"]
    Svc --> Outbox["OutboxEvent writes"]
    Repo --> Prisma["Prisma client"]
    Prisma --> PG[(PostgreSQL)]
    SSE --> PG
    RH --> OpenAPI["/api/openapi"]
    OpenAPI --> Docs["Scalar /docs"]
```

## Runtime packaging

`docker compose up --build` starts two containers, `app` and `postgres`, serving **http://localhost:3005**. The entrypoint waits for the database, applies migrations, and seeds only when the table is empty.

## Visibility / ownership

- `Todo.ownerId = null` → shared board (anonymous readable/writable; concurrent edits use `version`).
- Signed-in user → shared todos **plus** own todos; owned writes require owning session.

## Request flow (complete recurring todo)

```mermaid
sequenceDiagram
    participant Client
    participant API as RouteHandler
    participant Svc as TodoService
    participant DB as PostgreSQL

    Client->>API: PATCH /api/todos/:id status=COMPLETED version=N
    API->>Svc: updateTodo()
    Svc->>DB: BEGIN
    Svc->>DB: Load todo + version check
    alt version mismatch
        Svc-->>Client: 409 VERSION_CONFLICT
    else ok and newly completed + recurring
        Svc->>DB: Mark completed, increment version
        Svc->>DB: Insert next occurrence if previousOccurrenceId unique
        Svc->>DB: Clone dependency edges
        Svc->>DB: Insert OutboxEvent todo.updated/created
        Svc->>DB: COMMIT
        Svc-->>Client: 200 updated todo
        Note over Client: SSE invalidates queries in other tabs
    end
```

## Data model (simplified)

- `User` / `Session`: email/password auth via httpOnly cookie.
- `Todo`: core fields, recurrence metadata, `version`, `completedAt`, `deletedAt`, optional `previousOccurrenceId` (unique), optional `ownerId`.
- `TodoDependency`: self-join (`todoId` depends on `dependsOnTodoId`).
- `OutboxEvent`: append-only stream for realtime invalidation.

## Concurrency notes

- Completing the same recurring todo twice concurrently: one writer wins the version update; unique `previousOccurrenceId` ensures at most one next task.
- Moving a blocked todo to `IN_PROGRESS` returns `409 BLOCKED_BY_DEPENDENCIES`.
- Soft-deleted rows are excluded from normal lists and dashboard aggregates.
- Stale `version` updates return `409 VERSION_CONFLICT`.
- Outbox events older than 1 day are pruned during SSE polling (invalidation stream, not a durable event store).
