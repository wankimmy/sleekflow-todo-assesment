import { beforeEach, describe, expect, it } from "vitest";
import {
  RecurrenceFrequency,
  TodoPriority,
  TodoStatus,
} from "@prisma/client";
import { AppError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import {
  createTodo,
  listTodos,
  restoreTodo,
  softDeleteTodo,
  updateTodo,
} from "@/features/todos/todo.service";

async function resetDatabase() {
  await prisma.outboxEvent.deleteMany();
  await prisma.todoDependency.deleteMany();
  await prisma.todo.deleteMany();
}

describe("todo service integration", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("soft deletes and restores without permanent data loss", async () => {
    const created = await createTodo({
      name: "Soft delete me",
      description: "",
      dueDate: new Date("2026-08-20T00:00:00.000Z"),
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.LOW,
      dependencyIds: [],
      isRecurring: false,
      sharedBoard: true,
    });

    const deleted = await softDeleteTodo(created.id);
    expect(deleted.deletedAt).not.toBeNull();

    const active = await listTodos({
      page: 1,
      pageSize: 25,
      sortBy: "dueDate",
      sortOrder: "asc",
      includeDeleted: false,
      onlyDeleted: false,
    });
    expect(active.items.find((todo) => todo.id === created.id)).toBeUndefined();

    const restored = await restoreTodo(created.id);
    expect(restored.deletedAt).toBeNull();
  });

  it("blocks moving to In Progress until dependencies are completed", async () => {
    const prerequisite = await createTodo({
      name: "Prerequisite",
      description: "",
      dueDate: new Date("2026-08-15T00:00:00.000Z"),
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.HIGH,
      dependencyIds: [],
      isRecurring: false,
      sharedBoard: true,
    });

    const dependent = await createTodo({
      name: "Dependent",
      description: "",
      dueDate: new Date("2026-08-16T00:00:00.000Z"),
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.MEDIUM,
      dependencyIds: [prerequisite.id],
      isRecurring: false,
      sharedBoard: true,
    });

    await expect(
      updateTodo(dependent.id, {
        status: TodoStatus.IN_PROGRESS,
        version: dependent.version,
      }),
    ).rejects.toMatchObject({
      code: "BLOCKED_BY_DEPENDENCIES",
      status: 409,
    } satisfies Partial<AppError>);

    await updateTodo(prerequisite.id, {
      status: TodoStatus.COMPLETED,
      version: prerequisite.version,
    });

    const started = await updateTodo(dependent.id, {
      status: TodoStatus.IN_PROGRESS,
      version: dependent.version,
    });
    expect(started.status).toBe(TodoStatus.IN_PROGRESS);
  });

  it("creates exactly one next occurrence when completing a recurring todo concurrently", async () => {
    const recurring = await createTodo({
      name: "Daily standup notes",
      description: "Capture blockers",
      dueDate: new Date("2026-08-10T00:00:00.000Z"),
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.MEDIUM,
      dependencyIds: [],
      isRecurring: true,
      sharedBoard: true,
      recurrenceFrequency: RecurrenceFrequency.DAILY,
    });

    const [first, second] = await Promise.allSettled([
      updateTodo(recurring.id, {
        status: TodoStatus.COMPLETED,
        version: recurring.version,
      }),
      updateTodo(recurring.id, {
        status: TodoStatus.COMPLETED,
        version: recurring.version,
      }),
    ]);

    const successes = [first, second].filter(
      (result) => result.status === "fulfilled",
    );
    const failures = [first, second].filter(
      (result) => result.status === "rejected",
    );

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const nextOccurrences = await prisma.todo.findMany({
      where: { previousOccurrenceId: recurring.id },
    });
    expect(nextOccurrences).toHaveLength(1);
    expect(nextOccurrences[0]?.dueDate.toISOString()).toBe(
      "2026-08-11T00:00:00.000Z",
    );
  });

  it("rejects stale version updates", async () => {
    const todo = await createTodo({
      name: "Versioned",
      description: "",
      dueDate: new Date("2026-08-18T00:00:00.000Z"),
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.LOW,
      dependencyIds: [],
      isRecurring: false,
      sharedBoard: true,
    });

    await updateTodo(todo.id, {
      name: "Updated once",
      version: todo.version,
    });

    await expect(
      updateTodo(todo.id, {
        name: "Stale update",
        version: todo.version,
      }),
    ).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      status: 409,
    });
  });

  it("filters blocked and unblocked todos", async () => {
    const prerequisite = await createTodo({
      name: "A",
      description: "",
      dueDate: new Date("2026-08-12T00:00:00.000Z"),
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.HIGH,
      dependencyIds: [],
      isRecurring: false,
      sharedBoard: true,
    });

    await createTodo({
      name: "Blocked task",
      description: "",
      dueDate: new Date("2026-08-13T00:00:00.000Z"),
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.MEDIUM,
      dependencyIds: [prerequisite.id],
      isRecurring: false,
      sharedBoard: true,
    });

    await createTodo({
      name: "Free task",
      description: "",
      dueDate: new Date("2026-08-14T00:00:00.000Z"),
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.LOW,
      dependencyIds: [],
      isRecurring: false,
      sharedBoard: true,
    });

    const blocked = await listTodos({
      page: 1,
      pageSize: 25,
      sortBy: "name",
      sortOrder: "asc",
      dependencyStatus: "blocked",
      includeDeleted: false,
      onlyDeleted: false,
    });
    expect(blocked.items.map((todo) => todo.name)).toEqual(["Blocked task"]);

    const unblocked = await listTodos({
      page: 1,
      pageSize: 25,
      sortBy: "name",
      sortOrder: "asc",
      dependencyStatus: "unblocked",
      includeDeleted: false,
      onlyDeleted: false,
    });
    expect(unblocked.items.map((todo) => todo.name).sort()).toEqual([
      "A",
      "Free task",
    ]);
  });

  it("sorts by priority, status, due date, and name", async () => {
    await createTodo({
      name: "Charlie",
      description: "",
      dueDate: new Date("2026-08-30T00:00:00.000Z"),
      status: TodoStatus.COMPLETED,
      priority: TodoPriority.LOW,
      dependencyIds: [],
      isRecurring: false,
      sharedBoard: true,
    });
    await createTodo({
      name: "Alpha",
      description: "",
      dueDate: new Date("2026-08-10T00:00:00.000Z"),
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.HIGH,
      dependencyIds: [],
      isRecurring: false,
      sharedBoard: true,
    });
    await createTodo({
      name: "Bravo",
      description: "",
      dueDate: new Date("2026-08-20T00:00:00.000Z"),
      status: TodoStatus.IN_PROGRESS,
      priority: TodoPriority.MEDIUM,
      dependencyIds: [],
      isRecurring: false,
      sharedBoard: true,
    });

    const byName = await listTodos({
      page: 1,
      pageSize: 25,
      sortBy: "name",
      sortOrder: "asc",
      includeDeleted: false,
      onlyDeleted: false,
    });
    expect(byName.items.map((todo) => todo.name)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);

    const byDueDate = await listTodos({
      page: 1,
      pageSize: 25,
      sortBy: "dueDate",
      sortOrder: "asc",
      includeDeleted: false,
      onlyDeleted: false,
    });
    expect(byDueDate.items.map((todo) => todo.name)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);

    const byPriority = await listTodos({
      page: 1,
      pageSize: 25,
      sortBy: "priority",
      sortOrder: "desc",
      includeDeleted: false,
      onlyDeleted: false,
    });
    expect(byPriority.items.map((todo) => todo.priority)).toEqual([
      "HIGH",
      "MEDIUM",
      "LOW",
    ]);

    const byStatus = await listTodos({
      page: 1,
      pageSize: 25,
      sortBy: "status",
      sortOrder: "asc",
      includeDeleted: false,
      onlyDeleted: false,
    });
    expect(byStatus.items.map((todo) => todo.status)).toEqual([
      "NOT_STARTED",
      "IN_PROGRESS",
      "COMPLETED",
    ]);
  });

  it("supports stable cursor pagination across pages", async () => {
    for (const name of ["C1", "C2", "C3", "C4", "C5"]) {
      await createTodo({
        name,
        description: "",
        dueDate: new Date(`2026-08-${10 + Number(name.slice(1))}T00:00:00.000Z`),
        status: TodoStatus.NOT_STARTED,
        priority: TodoPriority.MEDIUM,
        dependencyIds: [],
        isRecurring: false,
        sharedBoard: true,
      });
    }

    const first = await listTodos({
      page: 1,
      pageSize: 2,
      sortBy: "name",
      sortOrder: "asc",
      includeDeleted: false,
      onlyDeleted: false,
    });
    expect(first.items.map((todo) => todo.name)).toEqual(["C1", "C2"]);
    expect(first.nextCursor).toBeTruthy();

    const second = await listTodos({
      page: 1,
      pageSize: 2,
      sortBy: "name",
      sortOrder: "asc",
      includeDeleted: false,
      onlyDeleted: false,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((todo) => todo.name)).toEqual(["C3", "C4"]);
    expect(second.nextCursor).toBeTruthy();

    const third = await listTodos({
      page: 1,
      pageSize: 2,
      sortBy: "name",
      sortOrder: "asc",
      includeDeleted: false,
      onlyDeleted: false,
      cursor: second.nextCursor!,
    });
    expect(third.items.map((todo) => todo.name)).toEqual(["C5"]);
    expect(third.nextCursor).toBeNull();
  });
});

