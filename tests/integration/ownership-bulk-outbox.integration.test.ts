import { beforeEach, describe, expect, it } from "vitest";
import { TodoPriority, TodoStatus } from "@prisma/client";
import { hash } from "bcryptjs";
import { AppError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import type { AuthUser } from "@/features/auth/auth.service";
import {
  bulkTodos,
  createTodo,
  getTodo,
  listTodos,
} from "@/features/todos/todo.service";

async function resetDatabase() {
  await prisma.outboxEvent.deleteMany();
  await prisma.todoDependency.deleteMany();
  await prisma.todo.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

async function createUser(
  email: string,
  name: string,
): Promise<AuthUser> {
  const passwordHash = await hash("password123", 4);
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
    },
    select: { id: true, email: true, name: true },
  });
  return user;
}

const listQuery = {
  page: 1,
  pageSize: 25,
  sortBy: "dueDate" as const,
  sortOrder: "asc" as const,
  includeDeleted: false,
  onlyDeleted: false,
};

describe("ownership, privacy, bulk, outbox", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("hides owned todos from anonymous lists and shows them to the owner", async () => {
    const alice = await createUser("alice@test.local", "Alice");

    const shared = await createTodo({
      name: "Shared board item",
      description: "",
      dueDate: new Date("2026-08-20T00:00:00.000Z"),
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.MEDIUM,
      dependencyIds: [],
      isRecurring: false,
      sharedBoard: true,
    });

    const owned = await createTodo(
      {
        name: "Alice private",
        description: "secret",
        dueDate: new Date("2026-08-21T00:00:00.000Z"),
        status: TodoStatus.NOT_STARTED,
        priority: TodoPriority.HIGH,
        dependencyIds: [],
        isRecurring: false,
        sharedBoard: false,
      },
      alice,
    );

    const anonymous = await listTodos(listQuery, null);
    expect(anonymous.items.map((t) => t.id)).toContain(shared.id);
    expect(anonymous.items.map((t) => t.id)).not.toContain(owned.id);

    const asAlice = await listTodos(listQuery, alice);
    expect(asAlice.items.map((t) => t.id)).toEqual(
      expect.arrayContaining([shared.id, owned.id]),
    );
  });

  it("rejects attaching an invisible private dependency and does not redact visible names", async () => {
    const alice = await createUser("alice2@test.local", "Alice");
    const bob = await createUser("bob@test.local", "Bob");

    const privateTodo = await createTodo(
      {
        name: "Alice secret dependency",
        description: "",
        dueDate: new Date("2026-08-15T00:00:00.000Z"),
        status: TodoStatus.COMPLETED,
        priority: TodoPriority.HIGH,
        dependencyIds: [],
        isRecurring: false,
        sharedBoard: false,
      },
      alice,
    );

    await expect(
      createTodo({
        name: "Anonymous dependent",
        description: "",
        dueDate: new Date("2026-08-16T00:00:00.000Z"),
        status: TodoStatus.NOT_STARTED,
        priority: TodoPriority.MEDIUM,
        dependencyIds: [privateTodo.id],
        isRecurring: false,
        sharedBoard: true,
      }),
    ).rejects.toMatchObject({
      code: "DEPENDENCY_NOT_FOUND",
      status: 400,
    } satisfies Partial<AppError>);

    await expect(
      createTodo(
        {
          name: "Bob tries Alice private",
          description: "",
          dueDate: new Date("2026-08-17T00:00:00.000Z"),
          status: TodoStatus.NOT_STARTED,
          priority: TodoPriority.LOW,
          dependencyIds: [privateTodo.id],
          isRecurring: false,
          sharedBoard: true,
        },
        bob,
      ),
    ).rejects.toMatchObject({
      code: "DEPENDENCY_NOT_FOUND",
      status: 400,
    } satisfies Partial<AppError>);

    const sharedDep = await createTodo({
      name: "Visible prerequisite",
      description: "",
      dueDate: new Date("2026-08-14T00:00:00.000Z"),
      status: TodoStatus.COMPLETED,
      priority: TodoPriority.MEDIUM,
      dependencyIds: [],
      isRecurring: false,
      sharedBoard: true,
    });

    const dependent = await createTodo({
      name: "Depends on visible",
      description: "",
      dueDate: new Date("2026-08-18T00:00:00.000Z"),
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.MEDIUM,
      dependencyIds: [sharedDep.id],
      isRecurring: false,
      sharedBoard: true,
    });

    const fetched = await getTodo(dependent.id, null);
    expect(fetched.dependencies).toEqual([
      expect.objectContaining({
        id: sharedDep.id,
        name: "Visible prerequisite",
      }),
    ]);

    // Alice can attach her private todo as a dependency of a shared board item.
    // Anonymous viewers must still see the edge (blocked logic) but not the name.
    const sharedWithPrivateDep = await createTodo(
      {
        name: "Shared depending on private",
        description: "",
        dueDate: new Date("2026-08-19T00:00:00.000Z"),
        status: TodoStatus.NOT_STARTED,
        priority: TodoPriority.MEDIUM,
        dependencyIds: [privateTodo.id],
        isRecurring: false,
        sharedBoard: true,
      },
      alice,
    );

    const anonymousView = await getTodo(sharedWithPrivateDep.id, null);
    expect(anonymousView.dependencies).toEqual([
      expect.objectContaining({
        id: privateTodo.id,
        name: "Private task",
        status: TodoStatus.COMPLETED,
      }),
    ]);

    const aliceView = await getTodo(sharedWithPrivateDep.id, alice);
    expect(aliceView.dependencies).toEqual([
      expect.objectContaining({
        id: privateTodo.id,
        name: "Alice secret dependency",
      }),
    ]);
  });

  it("applies bulk actions with partial failure when one version is stale", async () => {
    const a = await createTodo({
      name: "Bulk A",
      description: "",
      dueDate: new Date("2026-08-20T00:00:00.000Z"),
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.LOW,
      dependencyIds: [],
      isRecurring: false,
      sharedBoard: true,
    });
    const b = await createTodo({
      name: "Bulk B",
      description: "",
      dueDate: new Date("2026-08-21T00:00:00.000Z"),
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.LOW,
      dependencyIds: [],
      isRecurring: false,
      sharedBoard: true,
    });

    const result = await bulkTodos({
      action: "complete",
      ids: [a.id, b.id],
      versionById: {
        [a.id]: a.version,
        [b.id]: b.version + 99,
      },
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.id).toBe(a.id);
    expect(result.results[0]?.status).toBe(TodoStatus.COMPLETED);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      id: b.id,
      code: "VERSION_CONFLICT",
    });

    const stillOpen = await prisma.todo.findUniqueOrThrow({
      where: { id: b.id },
    });
    expect(stillOpen.status).toBe(TodoStatus.NOT_STARTED);
  });

  it("writes exactly one todo.created outbox row on create", async () => {
    const created = await createTodo({
      name: "Outbox probe",
      description: "",
      dueDate: new Date("2026-08-22T00:00:00.000Z"),
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.MEDIUM,
      dependencyIds: [],
      isRecurring: false,
      sharedBoard: true,
    });

    const events = await prisma.outboxEvent.findMany({
      where: { type: "todo.created" },
      orderBy: { id: "asc" },
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ id: created.id });
  });
});
