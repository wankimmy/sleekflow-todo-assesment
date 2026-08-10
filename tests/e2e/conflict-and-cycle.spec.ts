import { expect, test } from "@playwright/test";

test("version conflict returns 409 on stale update", async ({ request }) => {
  const createRes = await request.post("/api/todos", {
    data: {
      name: "E2E conflict target",
      description: "",
      dueDate: "2026-08-20",
      status: "NOT_STARTED",
      priority: "LOW",
      isRecurring: false,
      dependencyIds: [],
      sharedBoard: true,
    },
  });
  expect(createRes.ok()).toBeTruthy();
  const todo = (await createRes.json()).data;

  const first = await request.patch(`/api/todos/${todo.id}`, {
    data: { name: "Updated once", version: todo.version },
  });
  expect(first.ok()).toBeTruthy();

  const stale = await request.patch(`/api/todos/${todo.id}`, {
    data: { name: "Stale write", version: todo.version },
  });
  expect(stale.status()).toBe(409);
  const body = await stale.json();
  expect(body.error.code).toBe("VERSION_CONFLICT");
});

test("dependency cycle is rejected with 400", async ({ request }) => {
  const aRes = await request.post("/api/todos", {
    data: {
      name: "E2E cycle A",
      description: "",
      dueDate: "2026-08-21",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      isRecurring: false,
      dependencyIds: [],
      sharedBoard: true,
    },
  });
  const bRes = await request.post("/api/todos", {
    data: {
      name: "E2E cycle B",
      description: "",
      dueDate: "2026-08-22",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      isRecurring: false,
      dependencyIds: [],
      sharedBoard: true,
    },
  });
  expect(aRes.ok()).toBeTruthy();
  expect(bRes.ok()).toBeTruthy();
  const a = (await aRes.json()).data;
  const b = (await bRes.json()).data;

  const linkBToA = await request.patch(`/api/todos/${b.id}`, {
    data: { dependencyIds: [a.id], version: b.version },
  });
  expect(linkBToA.ok()).toBeTruthy();
  const bLinked = (await linkBToA.json()).data;

  const cycle = await request.patch(`/api/todos/${a.id}`, {
    data: { dependencyIds: [b.id], version: a.version },
  });
  expect(cycle.status()).toBe(400);
  const body = await cycle.json();
  expect(body.error.code).toBe("DEPENDENCY_CYCLE");

  // Ensure the failed write did not mutate A into a cycle edge.
  const aFresh = await request.get(`/api/todos/${a.id}`);
  const aData = (await aFresh.json()).data;
  expect(aData.dependencies.map((d: { id: string }) => d.id)).not.toContain(
    bLinked.id,
  );
});
