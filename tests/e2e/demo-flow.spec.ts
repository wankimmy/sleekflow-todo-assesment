import { expect, test } from "@playwright/test";

test("demo flow: unblock dependency, complete recurring todo, see next occurrence", async ({
  page,
  request,
}) => {
  // Ensure deterministic seed data for the demo path.
  const prereqRes = await request.post("/api/todos", {
    data: {
      name: "E2E prerequisite",
      description: "Must complete first",
      dueDate: "2026-08-11",
      status: "NOT_STARTED",
      priority: "HIGH",
      isRecurring: false,
      dependencyIds: [],
    },
  });
  expect(prereqRes.ok()).toBeTruthy();
  const prerequisite = (await prereqRes.json()).data;

  const weeklyRes = await request.post("/api/todos", {
    data: {
      name: "E2E weekly recurring",
      description: "Depends on prerequisite",
      dueDate: "2026-08-12",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      isRecurring: true,
      recurrenceFrequency: "WEEKLY",
      dependencyIds: [prerequisite.id],
    },
  });
  expect(weeklyRes.ok()).toBeTruthy();
  const weekly = (await weeklyRes.json()).data;
  expect(weekly.isBlocked).toBeTruthy();

  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await expect(page.getByText("E2E weekly recurring").first()).toBeVisible();
  await expect(page.locator("span.font-medium", { hasText: "Blocked" }).first()).toBeVisible();

  const completePrereq = await request.patch(`/api/todos/${prerequisite.id}`, {
    data: {
      status: "COMPLETED",
      version: prerequisite.version,
    },
  });
  expect(completePrereq.ok()).toBeTruthy();

  const refreshedWeeklyRes = await request.get(`/api/todos/${weekly.id}`);
  const refreshedWeekly = (await refreshedWeeklyRes.json()).data;
  expect(refreshedWeekly.isBlocked).toBeFalsy();

  const startWeekly = await request.patch(`/api/todos/${weekly.id}`, {
    data: { status: "IN_PROGRESS", version: refreshedWeekly.version },
  });
  expect(startWeekly.ok()).toBeTruthy();
  const started = (await startWeekly.json()).data;

  const completeWeekly = await request.patch(`/api/todos/${weekly.id}`, {
    data: { status: "COMPLETED", version: started.version },
  });
  expect(completeWeekly.ok()).toBeTruthy();

  const after = await request.get(
    "/api/todos?search=E2E%20weekly%20recurring&sortBy=dueDate&sortOrder=asc",
  );
  const afterJson = await after.json();
  const next = afterJson.data.items.find(
    (todo: { previousOccurrenceId: string | null }) =>
      todo.previousOccurrenceId === weekly.id,
  );
  expect(next).toBeTruthy();

  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
});
