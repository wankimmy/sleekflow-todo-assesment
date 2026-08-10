import {
  Prisma,
  Todo,
  TodoDependency,
  TodoPriority,
  TodoStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ListTodosQuery, ViewerContext } from "./todo.schemas";

export type TodoWithRelations = Todo & {
  dependsOn: Array<
    TodoDependency & {
      dependsOnTodo: Pick<
        Todo,
        "id" | "name" | "status" | "deletedAt" | "ownerId"
      >;
    }
  >;
  dependedOnBy: Array<
    TodoDependency & {
      todo: Pick<Todo, "id" | "name" | "status" | "deletedAt" | "ownerId">;
    }
  >;
};

const todoInclude = {
  dependsOn: {
    include: {
      dependsOnTodo: {
        select: {
          id: true,
          name: true,
          status: true,
          deletedAt: true,
          ownerId: true,
        },
      },
    },
  },
  dependedOnBy: {
    include: {
      todo: {
        select: {
          id: true,
          name: true,
          status: true,
          deletedAt: true,
          ownerId: true,
        },
      },
    },
  },
} satisfies Prisma.TodoInclude;

export type ListCursorPayload = {
  sortBy: ListTodosQuery["sortBy"];
  sortOrder: ListTodosQuery["sortOrder"];
  rank: string | number;
  id: string;
};

export function encodeListCursor(payload: ListCursorPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeListCursor(cursor: string): ListCursorPayload | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as ListCursorPayload;
    if (!parsed?.id || !parsed.sortBy || !parsed.sortOrder) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function visibilityWhere(viewer: ViewerContext): Prisma.TodoWhereInput {
  if (viewer.userId) {
    return {
      OR: [{ ownerId: null }, { ownerId: viewer.userId }],
    };
  }
  return { ownerId: null };
}

function canViewerSeeOwner(
  ownerId: string | null,
  viewer?: ViewerContext,
): boolean {
  return (
    ownerId === null ||
    (viewer?.userId !== null &&
      viewer?.userId !== undefined &&
      ownerId === viewer.userId)
  );
}

export function mapTodo(todo: TodoWithRelations, viewer?: ViewerContext) {
  const activeDependencies = todo.dependsOn.filter(
    (dep) => dep.dependsOnTodo.deletedAt === null,
  );
  const isBlocked = activeDependencies.some(
    (dep) => dep.dependsOnTodo.status !== TodoStatus.COMPLETED,
  );

  return {
    id: todo.id,
    name: todo.name,
    description: todo.description,
    dueDate: todo.dueDate.toISOString(),
    status: todo.status,
    priority: todo.priority,
    isRecurring: todo.isRecurring,
    recurrenceFrequency: todo.recurrenceFrequency,
    recurrenceInterval: todo.recurrenceInterval,
    recurrenceUnit: todo.recurrenceUnit,
    version: todo.version,
    completedAt: todo.completedAt?.toISOString() ?? null,
    deletedAt: todo.deletedAt?.toISOString() ?? null,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
    previousOccurrenceId: todo.previousOccurrenceId,
    ownerId: todo.ownerId,
    isBlocked,
    dependencies: activeDependencies.map((dep) => ({
      id: dep.dependsOnTodo.id,
      name: canViewerSeeOwner(dep.dependsOnTodo.ownerId, viewer)
        ? dep.dependsOnTodo.name
        : "Private task",
      status: dep.dependsOnTodo.status,
    })),
    dependents: todo.dependedOnBy
      .filter((dep) => dep.todo.deletedAt === null)
      .map((dep) => ({
        id: dep.todo.id,
        name: canViewerSeeOwner(dep.todo.ownerId, viewer)
          ? dep.todo.name
          : "Private task",
        status: dep.todo.status,
      })),
  };
}

export type MappedTodo = ReturnType<typeof mapTodo>;

function buildWhere(
  query: ListTodosQuery,
  viewer: ViewerContext,
): Prisma.TodoWhereInput {
  const and: Prisma.TodoWhereInput[] = [visibilityWhere(viewer)];
  const where: Prisma.TodoWhereInput = { AND: and };

  if (query.onlyDeleted) {
    where.deletedAt = { not: null };
  } else if (!query.includeDeleted) {
    where.deletedAt = null;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.priority) {
    where.priority = query.priority;
  }

  if (query.dueAfter || query.dueBefore) {
    where.dueDate = {};
    if (query.dueAfter) {
      where.dueDate.gte = query.dueAfter;
    }
    if (query.dueBefore) {
      where.dueDate.lte = query.dueBefore;
    }
  }

  if (query.search) {
    and.push({
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
        {
          dependsOn: {
            some: {
              dependsOnTodo: {
                deletedAt: null,
                name: { contains: query.search, mode: "insensitive" },
              },
            },
          },
        },
      ],
    });
  }

  if (query.dependencyStatus === "blocked") {
    and.push({
      dependsOn: {
        some: {
          dependsOnTodo: {
            deletedAt: null,
            status: { not: TodoStatus.COMPLETED },
          },
        },
      },
    });
  } else if (query.dependencyStatus === "unblocked") {
    and.push({
      NOT: {
        dependsOn: {
          some: {
            dependsOnTodo: {
              deletedAt: null,
              status: { not: TodoStatus.COMPLETED },
            },
          },
        },
      },
    });
  }

  return where;
}

function buildOrderBy(
  sortBy: ListTodosQuery["sortBy"],
  sortOrder: ListTodosQuery["sortOrder"],
): Prisma.TodoOrderByWithRelationInput[] {
  const direction = sortOrder;

  switch (sortBy) {
    case "dueDate":
      return [{ dueDate: direction }, { id: "asc" }];
    case "name":
      return [{ name: direction }, { id: "asc" }];
    case "createdAt":
      return [{ createdAt: direction }, { id: "asc" }];
    case "priority":
      return [{ priority: direction }, { id: "asc" }];
    case "status":
      return [{ status: direction }, { id: "asc" }];
    case "dependency":
      return [{ name: direction }, { id: "asc" }];
    default: {
      const exhaustive: never = sortBy;
      throw new Error(`Unsupported sortBy: ${exhaustive}`);
    }
  }
}

function needsRankedSqlSort(sortBy: ListTodosQuery["sortBy"]) {
  return (
    sortBy === "priority" ||
    sortBy === "status" ||
    sortBy === "dependency"
  );
}

function visibilitySql(viewer: ViewerContext) {
  if (viewer.userId) {
    return Prisma.sql`(t."ownerId" IS NULL OR t."ownerId" = ${viewer.userId})`;
  }
  return Prisma.sql`t."ownerId" IS NULL`;
}

async function findTodoIdsWithRankedSort(
  query: ListTodosQuery,
  viewer: ViewerContext,
) {
  const conditions: Prisma.Sql[] = [visibilitySql(viewer)];

  if (query.onlyDeleted) {
    conditions.push(Prisma.sql`t."deletedAt" IS NOT NULL`);
  } else if (!query.includeDeleted) {
    conditions.push(Prisma.sql`t."deletedAt" IS NULL`);
  }

  if (query.status) {
    conditions.push(Prisma.sql`t."status" = ${query.status}::"TodoStatus"`);
  }

  if (query.priority) {
    conditions.push(
      Prisma.sql`t."priority" = ${query.priority}::"TodoPriority"`,
    );
  }

  if (query.dueAfter) {
    conditions.push(Prisma.sql`t."dueDate" >= ${query.dueAfter}`);
  }

  if (query.dueBefore) {
    conditions.push(Prisma.sql`t."dueDate" <= ${query.dueBefore}`);
  }

  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(
      Prisma.sql`(
        t."name" ILIKE ${pattern}
        OR t."description" ILIKE ${pattern}
        OR EXISTS (
          SELECT 1
          FROM "TodoDependency" d
          INNER JOIN "Todo" dep ON dep."id" = d."dependsOnTodoId"
          WHERE d."todoId" = t."id"
            AND dep."deletedAt" IS NULL
            AND dep."name" ILIKE ${pattern}
        )
      )`,
    );
  }

  if (query.dependencyStatus === "blocked") {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1
      FROM "TodoDependency" d
      INNER JOIN "Todo" dep ON dep."id" = d."dependsOnTodoId"
      WHERE d."todoId" = t."id"
        AND dep."deletedAt" IS NULL
        AND dep."status" <> 'COMPLETED'::"TodoStatus"
    )`);
  } else if (query.dependencyStatus === "unblocked") {
    conditions.push(Prisma.sql`NOT EXISTS (
      SELECT 1
      FROM "TodoDependency" d
      INNER JOIN "Todo" dep ON dep."id" = d."dependsOnTodoId"
      WHERE d."todoId" = t."id"
        AND dep."deletedAt" IS NULL
        AND dep."status" <> 'COMPLETED'::"TodoStatus"
    )`);
  }

  const priorityRank = Prisma.sql`CASE t."priority"
    WHEN 'HIGH'::"TodoPriority" THEN 3
    WHEN 'MEDIUM'::"TodoPriority" THEN 2
    ELSE 1
  END`;

  const statusRank = Prisma.sql`CASE t."status"
    WHEN 'NOT_STARTED'::"TodoStatus" THEN 1
    WHEN 'IN_PROGRESS'::"TodoStatus" THEN 2
    WHEN 'COMPLETED'::"TodoStatus" THEN 3
    ELSE 4
  END`;

  const dependencyRank = Prisma.sql`CASE
    WHEN EXISTS (
      SELECT 1
      FROM "TodoDependency" d
      INNER JOIN "Todo" dep ON dep."id" = d."dependsOnTodoId"
      WHERE d."todoId" = t."id"
        AND dep."deletedAt" IS NULL
        AND dep."status" <> 'COMPLETED'::"TodoStatus"
    ) THEN 1
    ELSE 0
  END`;

  let rankExpr: Prisma.Sql;
  switch (query.sortBy) {
    case "priority":
      rankExpr = priorityRank;
      break;
    case "status":
      rankExpr = statusRank;
      break;
    case "dependency":
      rankExpr = dependencyRank;
      break;
    default:
      rankExpr = Prisma.sql`0`;
      break;
  }

  const direction =
    query.sortOrder === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  const decoded = query.cursor ? decodeListCursor(query.cursor) : null;
  const useCursor =
    Boolean(decoded) &&
    decoded!.sortBy === query.sortBy &&
    decoded!.sortOrder === query.sortOrder;

  // Filter conditions only — cursor must not shrink COUNT/totalPages.
  const filterWhereSql = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

  if (useCursor && decoded) {
    const cursorRank = Number(decoded.rank);
    const cmp =
      query.sortOrder === "asc"
        ? Prisma.sql`(${rankExpr} > ${cursorRank} OR (${rankExpr} = ${cursorRank} AND t."id" > ${decoded.id}))`
        : Prisma.sql`(${rankExpr} < ${cursorRank} OR (${rankExpr} = ${cursorRank} AND t."id" > ${decoded.id}))`;
    conditions.push(cmp);
  }

  const pageWhereSql = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
  const offset = useCursor ? 0 : (query.page - 1) * query.pageSize;
  const take = query.pageSize + (useCursor ? 1 : 0);

  const [countRows, idRows] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "Todo" t
      ${filterWhereSql}
    `),
    prisma.$queryRaw<Array<{ id: string; rank: number }>>(Prisma.sql`
      SELECT t."id", (${rankExpr})::int AS rank
      FROM "Todo" t
      ${pageWhereSql}
      ORDER BY ${rankExpr} ${direction}, t."id" ASC
      LIMIT ${take}
      ${useCursor ? Prisma.empty : Prisma.sql`OFFSET ${offset}`}
    `),
  ]);

  let rows = idRows;
  let nextCursor: string | null = null;
  if (useCursor && rows.length > query.pageSize) {
    rows = rows.slice(0, query.pageSize);
    const last = rows[rows.length - 1];
    if (last) {
      nextCursor = encodeListCursor({
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        rank: last.rank,
        id: last.id,
      });
    }
  } else if (!useCursor && rows.length > 0) {
    const last = rows[rows.length - 1];
    const pageEnd = query.page * query.pageSize;
    if (pageEnd < Number(countRows[0]?.count ?? 0) && last) {
      nextCursor = encodeListCursor({
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        rank: last.rank,
        id: last.id,
      });
    }
  }

  return {
    total: Number(countRows[0]?.count ?? 0),
    ids: rows.map((row) => row.id),
    nextCursor,
  };
}

function scalarKeysetWhere(
  query: ListTodosQuery,
  decoded: ListCursorPayload,
): Prisma.TodoWhereInput | null {
  if (
    decoded.sortBy !== query.sortBy ||
    decoded.sortOrder !== query.sortOrder
  ) {
    return null;
  }

  const id = decoded.id;
  const asc = query.sortOrder === "asc";

  switch (query.sortBy) {
    case "dueDate": {
      const dueDate = new Date(String(decoded.rank));
      return {
        OR: asc
          ? [{ dueDate: { gt: dueDate } }, { dueDate, id: { gt: id } }]
          : [{ dueDate: { lt: dueDate } }, { dueDate, id: { gt: id } }],
      };
    }
    case "name": {
      const name = String(decoded.rank);
      return {
        OR: asc
          ? [{ name: { gt: name } }, { name, id: { gt: id } }]
          : [{ name: { lt: name } }, { name, id: { gt: id } }],
      };
    }
    case "createdAt": {
      const createdAt = new Date(String(decoded.rank));
      return {
        OR: asc
          ? [
              { createdAt: { gt: createdAt } },
              { createdAt, id: { gt: id } },
            ]
          : [
              { createdAt: { lt: createdAt } },
              { createdAt, id: { gt: id } },
            ],
      };
    }
    default:
      return null;
  }
}

function rankValueForTodo(
  todo: MappedTodo,
  sortBy: ListTodosQuery["sortBy"],
): string | number {
  switch (sortBy) {
    case "dueDate":
      return todo.dueDate;
    case "name":
      return todo.name;
    case "createdAt":
      return todo.createdAt;
    case "priority":
      return todo.priority === "HIGH" ? 3 : todo.priority === "MEDIUM" ? 2 : 1;
    case "status":
      return todo.status === "NOT_STARTED"
        ? 1
        : todo.status === "IN_PROGRESS"
          ? 2
          : todo.status === "COMPLETED"
            ? 3
            : 4;
    case "dependency":
      return todo.isBlocked ? 1 : 0;
    default: {
      const exhaustive: never = sortBy;
      throw new Error(`Unsupported sortBy: ${exhaustive}`);
    }
  }
}

async function hydrateTodosByIds(ids: string[], viewer: ViewerContext) {
  if (ids.length === 0) {
    return [] as MappedTodo[];
  }

  const rows = await prisma.todo.findMany({
    where: { id: { in: ids } },
    include: todoInclude,
  });

  const byId = new Map(
    rows.map((row) => [row.id, mapTodo(row as TodoWithRelations, viewer)]),
  );

  return ids
    .map((id) => byId.get(id))
    .filter((todo): todo is MappedTodo => Boolean(todo));
}

export async function findTodos(
  query: ListTodosQuery,
  viewer: ViewerContext = { userId: null },
) {
  if (needsRankedSqlSort(query.sortBy)) {
    const { total, ids, nextCursor } = await findTodoIdsWithRankedSort(
      query,
      viewer,
    );
    const items = await hydrateTodosByIds(ids, viewer);

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      nextCursor,
    };
  }

  const where = buildWhere(query, viewer);
  const orderBy = buildOrderBy(query.sortBy, query.sortOrder);
  const decoded = query.cursor ? decodeListCursor(query.cursor) : null;
  const keyset = decoded ? scalarKeysetWhere(query, decoded) : null;

  if (keyset) {
    const take = query.pageSize + 1;
    const rows = await prisma.todo.findMany({
      where: { AND: [where, keyset] },
      include: todoInclude,
      orderBy,
      take,
    });

    const hasMore = rows.length > query.pageSize;
    const pageRows = hasMore ? rows.slice(0, query.pageSize) : rows;
    const items = pageRows.map((row) =>
      mapTodo(row as TodoWithRelations, viewer),
    );
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeListCursor({
            sortBy: query.sortBy,
            sortOrder: query.sortOrder,
            rank: rankValueForTodo(last, query.sortBy),
            id: last.id,
          })
        : null;

    const total = await prisma.todo.count({ where });

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      nextCursor,
    };
  }

  const skip = (query.page - 1) * query.pageSize;

  const [total, rows] = await Promise.all([
    prisma.todo.count({ where }),
    prisma.todo.findMany({
      where,
      include: todoInclude,
      orderBy,
      skip,
      take: query.pageSize,
    }),
  ]);

  const items = rows.map((row) => mapTodo(row as TodoWithRelations, viewer));
  const last = items[items.length - 1];
  const nextCursor =
    query.page * query.pageSize < total && last
      ? encodeListCursor({
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
          rank: rankValueForTodo(last, query.sortBy),
          id: last.id,
        })
      : null;

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    nextCursor,
  };
}

export async function findTodoById(
  id: string,
  includeDeleted = false,
  viewer: ViewerContext = { userId: null },
) {
  const todo = await prisma.todo.findFirst({
    where: {
      id,
      ...(includeDeleted ? {} : { deletedAt: null }),
    },
    include: todoInclude,
  });

  return todo ? mapTodo(todo as TodoWithRelations, viewer) : null;
}

export async function findTodosInRange(
  start: Date,
  end: Date,
  viewer: ViewerContext = { userId: null },
) {
  const rows = await prisma.todo.findMany({
    where: {
      deletedAt: null,
      dueDate: {
        gte: start,
        lte: end,
      },
      ...visibilityWhere(viewer),
    },
    include: todoInclude,
    orderBy: { dueDate: "asc" },
  });

  return rows.map((row) => mapTodo(row as TodoWithRelations, viewer));
}

export async function getDashboardStats(
  viewer: ViewerContext = { userId: null },
) {
  const visible = visibilityWhere(viewer);
  const baseWhere: Prisma.TodoWhereInput = {
    deletedAt: null,
    AND: [visible],
  };

  const [total, statusGroups, priorityGroups, blocked, upcomingRows] =
    await Promise.all([
      prisma.todo.count({ where: baseWhere }),
      prisma.todo.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.todo.groupBy({
        by: ["priority"],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.todo.count({
        where: {
          ...baseWhere,
          dependsOn: {
            some: {
              dependsOnTodo: {
                deletedAt: null,
                status: { not: TodoStatus.COMPLETED },
              },
            },
          },
        },
      }),
      prisma.todo.findMany({
        where: {
          ...baseWhere,
          status: {
            in: [TodoStatus.NOT_STARTED, TodoStatus.IN_PROGRESS],
          },
        },
        include: todoInclude,
        orderBy: [{ dueDate: "asc" }, { id: "asc" }],
        take: 8,
      }),
    ]);

  const byStatus: Record<TodoStatus, number> = {
    NOT_STARTED: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    ARCHIVED: 0,
  };

  for (const group of statusGroups) {
    byStatus[group.status] = group._count._all;
  }

  const byPriority: Record<TodoPriority, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
  };

  for (const group of priorityGroups) {
    byPriority[group.priority] = group._count._all;
  }

  return {
    total,
    byStatus,
    byPriority,
    dependencyHealth: {
      blocked,
      unblocked: Math.max(0, total - blocked),
    },
    upcoming: upcomingRows.map((row) =>
      mapTodo(row as TodoWithRelations, viewer),
    ),
  };
}

export async function findDependencyGraph(
  viewer: ViewerContext = { userId: null },
  limit = 500,
) {
  const todos = await prisma.todo.findMany({
    where: {
      deletedAt: null,
      ...visibilityWhere(viewer),
    },
    select: {
      id: true,
      name: true,
      status: true,
      priority: true,
      ownerId: true,
      dependsOn: {
        select: {
          dependsOnTodoId: true,
          dependsOnTodo: { select: { deletedAt: true } },
        },
      },
    },
    take: limit,
    orderBy: { name: "asc" },
  });

  const nodes = todos.map((todo) => ({
    id: todo.id,
    name: todo.name,
    status: todo.status,
    priority: todo.priority,
    ownerId: todo.ownerId,
  }));

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: Array<{ from: string; to: string }> = [];

  for (const todo of todos) {
    for (const dep of todo.dependsOn) {
      if (dep.dependsOnTodo.deletedAt !== null) continue;
      if (!nodeIds.has(dep.dependsOnTodoId)) continue;
      edges.push({ from: dep.dependsOnTodoId, to: todo.id });
    }
  }

  return { nodes, edges };
}

export { todoInclude, prisma };
