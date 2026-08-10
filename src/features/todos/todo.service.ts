import {
  Prisma,
  RecurrenceFrequency,
  RecurrenceUnit,
  TodoStatus,
} from "@prisma/client";
import { AppError } from "@/lib/api-response";
import type { AuthUser } from "@/features/auth/auth.service";
import { assertCanWriteTodo } from "@/features/auth/auth.service";
import { writeOutbox } from "./outbox";
import { computeNextDueDate } from "./recurrence";
import {
  findDependencyGraph,
  findTodoById,
  findTodos,
  findTodosInRange,
  getDashboardStats,
  mapTodo,
  prisma,
  todoInclude,
  type MappedTodo,
  type TodoWithRelations,
} from "./todo.repository";
import type {
  BulkTodosInput,
  CreateTodoInput,
  ListTodosQuery,
  UpdateTodoInput,
  ViewerContext,
} from "./todo.schemas";

async function assertDependenciesExist(
  dependencyIds: string[],
  viewer: ViewerContext,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  if (dependencyIds.length === 0) {
    return;
  }

  const found = await tx.todo.findMany({
    where: {
      id: { in: dependencyIds },
      deletedAt: null,
      OR: viewer.userId
        ? [{ ownerId: null }, { ownerId: viewer.userId }]
        : [{ ownerId: null }],
    },
    select: { id: true },
  });

  if (found.length !== dependencyIds.length) {
    const foundIds = new Set(found.map((todo) => todo.id));
    const missing = dependencyIds.filter((id) => !foundIds.has(id));
    throw new AppError(
      "DEPENDENCY_NOT_FOUND",
      "One or more dependency todos were not found",
      400,
      { missing },
    );
  }
}

/**
 * Bounded reachability check: walk from proposed dependencyIds along existing
 * edges (excluding edges from `todoId`, which are being replaced). Returns true
 * if `todoId` is reachable — i.e. the proposed edges would create a cycle.
 */
async function assertNoCycle(
  todoId: string,
  dependencyIds: string[],
  tx: Prisma.TransactionClient,
) {
  if (dependencyIds.length === 0) {
    return;
  }

  if (dependencyIds.includes(todoId)) {
    throw new AppError(
      "DEPENDENCY_CYCLE",
      "Dependencies would create a cycle",
      400,
    );
  }

  const rows = await tx.$queryRaw<Array<{ has_cycle: boolean }>>(Prisma.sql`
    WITH RECURSIVE reach AS (
      SELECT d.id, 1 AS depth
      FROM unnest(ARRAY[${Prisma.join(dependencyIds)}]::text[]) AS d(id)
      UNION
      SELECT td."dependsOnTodoId", reach.depth + 1
      FROM "TodoDependency" td
      INNER JOIN reach ON reach.id = td."todoId"
      WHERE td."todoId" <> ${todoId}
        AND reach.depth < 1000
    )
    SELECT EXISTS (
      SELECT 1 FROM reach WHERE id = ${todoId}
    ) AS has_cycle
  `);

  if (rows[0]?.has_cycle) {
    throw new AppError(
      "DEPENDENCY_CYCLE",
      "Dependencies would create a cycle",
      400,
    );
  }
}

function normalizeRecurrence(input: {
  isRecurring: boolean;
  recurrenceFrequency?: RecurrenceFrequency | null;
  recurrenceInterval?: number | null;
  recurrenceUnit?: RecurrenceUnit | null;
}): {
  isRecurring: boolean;
  recurrenceFrequency: RecurrenceFrequency | null;
  recurrenceInterval: number | null;
  recurrenceUnit: RecurrenceUnit | null;
} {
  if (!input.isRecurring) {
    return {
      isRecurring: false,
      recurrenceFrequency: null,
      recurrenceInterval: null,
      recurrenceUnit: null,
    };
  }

  const frequency = input.recurrenceFrequency!;

  if (frequency === RecurrenceFrequency.CUSTOM) {
    return {
      isRecurring: true,
      recurrenceFrequency: frequency,
      recurrenceInterval: input.recurrenceInterval ?? 1,
      recurrenceUnit: input.recurrenceUnit ?? RecurrenceUnit.DAYS,
    };
  }

  return {
    isRecurring: true,
    recurrenceFrequency: frequency,
    recurrenceInterval: 1,
    recurrenceUnit:
      frequency === RecurrenceFrequency.DAILY
        ? RecurrenceUnit.DAYS
        : frequency === RecurrenceFrequency.WEEKLY
          ? RecurrenceUnit.WEEKS
          : RecurrenceUnit.MONTHS,
  };
}

function viewerFromUser(user: AuthUser | null): ViewerContext {
  return { userId: user?.id ?? null };
}

export async function listTodos(
  query: ListTodosQuery,
  user: AuthUser | null = null,
) {
  return findTodos(query, viewerFromUser(user));
}

export async function getTodo(id: string, user: AuthUser | null = null) {
  const viewer = viewerFromUser(user);
  const todo = await findTodoById(id, false, viewer);
  if (!todo) {
    throw new AppError("NOT_FOUND", "Todo not found", 404);
  }

  const visible =
    todo.ownerId === null ||
    (viewer.userId !== null && todo.ownerId === viewer.userId);
  if (!visible) {
    throw new AppError("NOT_FOUND", "Todo not found", 404);
  }

  return todo;
}

export async function createTodo(
  input: CreateTodoInput,
  user: AuthUser | null = null,
): Promise<MappedTodo> {
  if (!input.sharedBoard && !user) {
    throw new AppError(
      "UNAUTHORIZED",
      "Sign in to create a personal todo",
      401,
    );
  }

  const viewer = viewerFromUser(user);
  const recurrence = normalizeRecurrence(input);
  const ownerId = input.sharedBoard ? null : user!.id;

  const created = await prisma.$transaction(async (tx) => {
    await assertDependenciesExist(input.dependencyIds, viewer, tx);

    if (input.status === TodoStatus.IN_PROGRESS && input.dependencyIds.length > 0) {
      const deps = await tx.todo.findMany({
        where: {
          id: { in: input.dependencyIds },
          deletedAt: null,
          OR: viewer.userId
            ? [{ ownerId: null }, { ownerId: viewer.userId }]
            : [{ ownerId: null }],
        },
        select: { status: true },
      });
      if (
        deps.length !== input.dependencyIds.length ||
        deps.some((dep) => dep.status !== TodoStatus.COMPLETED)
      ) {
        throw new AppError(
          "BLOCKED_BY_DEPENDENCIES",
          "Todo cannot start as In Progress until all dependencies are Completed",
          409,
        );
      }
    }

    const todo = await tx.todo.create({
      data: {
        name: input.name,
        description: input.description,
        dueDate: input.dueDate,
        status: input.status,
        priority: input.priority,
        ownerId,
        ...recurrence,
        completedAt:
          input.status === TodoStatus.COMPLETED ? new Date() : null,
      },
    });

    if (input.dependencyIds.length > 0) {
      await assertNoCycle(todo.id, input.dependencyIds, tx);

      await tx.todoDependency.createMany({
        data: input.dependencyIds.map((dependsOnTodoId) => ({
          todoId: todo.id,
          dependsOnTodoId,
        })),
      });
    }

    const withRelations = await tx.todo.findUniqueOrThrow({
      where: { id: todo.id },
      include: todoInclude,
    });

    if (input.status === TodoStatus.COMPLETED && withRelations.isRecurring) {
      await createNextOccurrence(tx, withRelations as TodoWithRelations);
    }

    const finalTodo = await tx.todo.findUniqueOrThrow({
      where: { id: todo.id },
      include: todoInclude,
    });

    await writeOutbox(tx, "todo.created", { id: todo.id });
    return finalTodo;
  });

  return mapTodo(created as TodoWithRelations, viewer);
}

async function createNextOccurrence(
  tx: Prisma.TransactionClient,
  current: TodoWithRelations,
) {
  const existingNext = await tx.todo.findFirst({
    where: { previousOccurrenceId: current.id },
  });

  if (existingNext) {
    return existingNext;
  }

  if (!current.isRecurring || !current.recurrenceFrequency) {
    return null;
  }

  const nextDueDate = computeNextDueDate(current.dueDate, {
    frequency: current.recurrenceFrequency,
    interval: current.recurrenceInterval,
    unit: current.recurrenceUnit,
  });

  const next = await tx.todo.create({
    data: {
      name: current.name,
      description: current.description,
      dueDate: nextDueDate,
      status: TodoStatus.NOT_STARTED,
      priority: current.priority,
      isRecurring: current.isRecurring,
      recurrenceFrequency: current.recurrenceFrequency,
      recurrenceInterval: current.recurrenceInterval,
      recurrenceUnit: current.recurrenceUnit,
      previousOccurrenceId: current.id,
      ownerId: current.ownerId,
    },
  });

  const dependencyIds = current.dependsOn
    .filter((dep) => dep.dependsOnTodo.deletedAt === null)
    .map((dep) => dep.dependsOnTodoId);

  if (dependencyIds.length > 0) {
    await tx.todoDependency.createMany({
      data: dependencyIds.map((dependsOnTodoId) => ({
        todoId: next.id,
        dependsOnTodoId,
      })),
    });
  }

  await writeOutbox(tx, "todo.created", {
    id: next.id,
    fromOccurrence: current.id,
  });

  return next;
}

export async function updateTodo(
  id: string,
  input: UpdateTodoInput,
  user: AuthUser | null = null,
): Promise<MappedTodo> {
  const viewer = viewerFromUser(user);
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.todo.findFirst({
      where: { id, deletedAt: null },
      include: todoInclude,
    });

    if (!current) {
      throw new AppError("NOT_FOUND", "Todo not found", 404);
    }

    assertCanWriteTodo(current, user);

    if (current.version !== input.version) {
      throw new AppError(
        "VERSION_CONFLICT",
        "Todo was modified by another request. Refresh and try again.",
        409,
        { currentVersion: current.version },
      );
    }

    const nextStatus = input.status ?? current.status;

    if (
      nextStatus === TodoStatus.IN_PROGRESS &&
      current.status !== TodoStatus.IN_PROGRESS
    ) {
      const blocked = current.dependsOn
        .filter((dep) => dep.dependsOnTodo.deletedAt === null)
        .some((dep) => dep.dependsOnTodo.status !== TodoStatus.COMPLETED);

      if (blocked) {
        throw new AppError(
          "BLOCKED_BY_DEPENDENCIES",
          "Todo cannot move to In Progress until all dependencies are Completed",
          409,
        );
      }
    }

    if (input.dependencyIds) {
      await assertDependenciesExist(input.dependencyIds, viewer, tx);
      await assertNoCycle(id, input.dependencyIds, tx);

      await tx.todoDependency.deleteMany({ where: { todoId: id } });
      if (input.dependencyIds.length > 0) {
        await tx.todoDependency.createMany({
          data: input.dependencyIds.map((dependsOnTodoId) => ({
            todoId: id,
            dependsOnTodoId,
          })),
        });
      }
    }

    const recurrenceSource = {
      isRecurring: input.isRecurring ?? current.isRecurring,
      recurrenceFrequency:
        input.recurrenceFrequency !== undefined
          ? input.recurrenceFrequency
          : current.recurrenceFrequency,
      recurrenceInterval:
        input.recurrenceInterval !== undefined
          ? input.recurrenceInterval
          : current.recurrenceInterval,
      recurrenceUnit:
        input.recurrenceUnit !== undefined
          ? input.recurrenceUnit
          : current.recurrenceUnit,
    };

    const recurrence = normalizeRecurrence(recurrenceSource);

    const becomingCompleted =
      nextStatus === TodoStatus.COMPLETED &&
      current.status !== TodoStatus.COMPLETED;

    try {
      const updated = await tx.todo.update({
        where: {
          id,
          version: input.version,
          deletedAt: null,
        },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          status: nextStatus,
          ...recurrence,
          completedAt: becomingCompleted
            ? new Date()
            : nextStatus === TodoStatus.COMPLETED
              ? current.completedAt
              : null,
          version: { increment: 1 },
        },
        include: todoInclude,
      });

      if (becomingCompleted && updated.isRecurring) {
        await createNextOccurrence(tx, updated as TodoWithRelations);
      }

      const finalTodo = await tx.todo.findUniqueOrThrow({
        where: { id },
        include: todoInclude,
      });

      await writeOutbox(tx, "todo.updated", { id });
      return finalTodo;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new AppError(
          "VERSION_CONFLICT",
          "Todo was modified by another request. Refresh and try again.",
          409,
        );
      }
      throw error;
    }
  });

  return mapTodo(result as TodoWithRelations, viewer);
}

export async function softDeleteTodo(
  id: string,
  user: AuthUser | null = null,
): Promise<MappedTodo> {
  const viewer = viewerFromUser(user);
  const deleted = await prisma.$transaction(async (tx) => {
    const current = await tx.todo.findFirst({
      where: { id, deletedAt: null },
      include: todoInclude,
    });

    if (!current) {
      throw new AppError("NOT_FOUND", "Todo not found", 404);
    }

    assertCanWriteTodo(current, user);

    const row = await tx.todo.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        version: { increment: 1 },
      },
      include: todoInclude,
    });

    await writeOutbox(tx, "todo.deleted", { id });
    return row;
  });

  return mapTodo(deleted as TodoWithRelations, viewer);
}

export async function restoreTodo(
  id: string,
  user: AuthUser | null = null,
): Promise<MappedTodo> {
  const viewer = viewerFromUser(user);
  const restored = await prisma.$transaction(async (tx) => {
    const current = await tx.todo.findFirst({
      where: { id, deletedAt: { not: null } },
      include: todoInclude,
    });

    if (!current) {
      throw new AppError("NOT_FOUND", "Deleted todo not found", 404);
    }

    assertCanWriteTodo(current, user);

    const row = await tx.todo.update({
      where: { id },
      data: {
        deletedAt: null,
        version: { increment: 1 },
      },
      include: todoInclude,
    });

    await writeOutbox(tx, "todo.restored", { id });
    return row;
  });

  return mapTodo(restored as TodoWithRelations, viewer);
}

export async function bulkTodos(
  input: BulkTodosInput,
  user: AuthUser | null = null,
) {
  const results: MappedTodo[] = [];
  const errors: Array<{ id: string; code: string; message: string }> = [];

  for (const id of input.ids) {
    try {
      switch (input.action) {
        case "complete": {
          const version = input.versionById?.[id];
          if (!version) {
            throw new AppError(
              "VALIDATION_ERROR",
              "versionById is required for complete",
              400,
            );
          }
          results.push(
            await updateTodo(id, { version, status: TodoStatus.COMPLETED }, user),
          );
          break;
        }
        case "setStatus": {
          const version = input.versionById?.[id];
          if (!version || !input.status) {
            throw new AppError(
              "VALIDATION_ERROR",
              "versionById and status are required for setStatus",
              400,
            );
          }
          results.push(
            await updateTodo(id, { version, status: input.status }, user),
          );
          break;
        }
        case "softDelete":
          results.push(await softDeleteTodo(id, user));
          break;
        case "restore":
          results.push(await restoreTodo(id, user));
          break;
        default: {
          const exhaustive: never = input.action;
          throw new Error(`Unsupported bulk action: ${exhaustive}`);
        }
      }
    } catch (error) {
      if (error instanceof AppError) {
        errors.push({ id, code: error.code, message: error.message });
      } else {
        throw error;
      }
    }
  }

  await prisma.outboxEvent.create({
    data: {
      type: "todo.bulk",
      payload: {
        action: input.action,
        ids: input.ids,
        successCount: results.length,
        errorCount: errors.length,
      },
    },
  });

  return { results, errors };
}

export async function getCalendarTodos(
  start: Date,
  end: Date,
  user: AuthUser | null = null,
) {
  return findTodosInRange(start, end, viewerFromUser(user));
}

export async function getDashboard(user: AuthUser | null = null) {
  return getDashboardStats(viewerFromUser(user));
}

export async function getGraph(user: AuthUser | null = null) {
  return findDependencyGraph(viewerFromUser(user));
}
