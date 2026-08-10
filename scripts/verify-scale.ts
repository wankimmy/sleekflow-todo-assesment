import { config } from "dotenv";
import {
  PrismaClient,
  TodoPriority,
  TodoStatus,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { addDays } from "date-fns";
import { Pool } from "pg";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const TOTAL = 10_000;
const BATCH = 500;
const MARKER = "scale-verify:";

async function main() {
  const connectionString =
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("TEST_DATABASE_URL or DATABASE_URL is required");
  }

  // Point the app prisma singleton at the isolated scale DB.
  process.env.DATABASE_URL = connectionString;

  const { findTodos, getDashboardStats, prisma } = await import(
    "../src/features/todos/todo.repository"
  );

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const seedClient = new PrismaClient({ adapter });

  const startedAt = Date.now();
  console.log(`Creating ${TOTAL} temporary todos marked ${MARKER}…`);

  try {
    await seedClient.todoDependency.deleteMany({
      where: {
        OR: [
          { todo: { name: { startsWith: MARKER } } },
          { dependsOnTodo: { name: { startsWith: MARKER } } },
        ],
      },
    });
    await seedClient.todo.deleteMany({
      where: { name: { startsWith: MARKER } },
    });

    const priorities: TodoPriority[] = [
      TodoPriority.LOW,
      TodoPriority.MEDIUM,
      TodoPriority.HIGH,
    ];
    const statuses: TodoStatus[] = [
      TodoStatus.NOT_STARTED,
      TodoStatus.IN_PROGRESS,
      TodoStatus.COMPLETED,
      TodoStatus.ARCHIVED,
    ];

    for (let offset = 0; offset < TOTAL; offset += BATCH) {
      const count = Math.min(BATCH, TOTAL - offset);
      await seedClient.todo.createMany({
        data: Array.from({ length: count }, (_, index) => {
          const n = offset + index;
          return {
            name: `${MARKER} task ${n}`,
            description: `Scale verification row ${n}`,
            dueDate: addDays(new Date("2026-08-01T00:00:00.000Z"), n % 60),
            status: statuses[n % statuses.length]!,
            priority: priorities[n % priorities.length]!,
          };
        }),
      });
      process.stdout.write(
        `\rInserted ${Math.min(offset + count, TOTAL)}/${TOTAL}`,
      );
    }
    process.stdout.write("\n");

    const listStart = Date.now();
    const page = await findTodos({
      page: 1,
      pageSize: 25,
      sortBy: "dueDate",
      sortOrder: "asc",
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.HIGH,
      search: MARKER,
      includeDeleted: false,
      onlyDeleted: false,
    });
    const listMs = Date.now() - listStart;

    const blockedStart = Date.now();
    const blockedPage = await findTodos({
      page: 1,
      pageSize: 25,
      sortBy: "priority",
      sortOrder: "desc",
      dependencyStatus: "unblocked",
      search: MARKER,
      includeDeleted: false,
      onlyDeleted: false,
    });
    const blockedMs = Date.now() - blockedStart;

    const dashboardStart = Date.now();
    const dashboard = await getDashboardStats();
    const dashboardMs = Date.now() - dashboardStart;

    const calendarStart = Date.now();
    const calendar = await seedClient.todo.findMany({
      where: {
        deletedAt: null,
        name: { startsWith: MARKER },
        dueDate: {
          gte: new Date("2026-08-01T00:00:00.000Z"),
          lte: new Date("2026-08-31T23:59:59.999Z"),
        },
      },
      orderBy: { dueDate: "asc" },
      take: 500,
    });
    const calendarMs = Date.now() - calendarStart;

    console.log(
      JSON.stringify(
        {
          inserted: TOTAL,
          listPageSize: page.items.length,
          listTotal: page.total,
          listQueryMs: listMs,
          rankedFilterPageSize: blockedPage.items.length,
          rankedFilterQueryMs: blockedMs,
          dashboardTotal: dashboard.total,
          dashboardQueryMs: dashboardMs,
          calendarSampleSize: calendar.length,
          calendarQueryMs: calendarMs,
          totalMs: Date.now() - startedAt,
          note: "Exercises findTodos/getDashboardStats used by the API; no brittle pass/fail threshold.",
        },
        null,
        2,
      ),
    );
  } finally {
    console.log("Cleaning up temporary scale data…");
    await seedClient.todoDependency.deleteMany({
      where: {
        OR: [
          { todo: { name: { startsWith: MARKER } } },
          { dependsOnTodo: { name: { startsWith: MARKER } } },
        ],
      },
    });
    const deleted = await seedClient.todo.deleteMany({
      where: { name: { startsWith: MARKER } },
    });
    console.log(`Deleted ${deleted.count} temporary todos.`);
    await seedClient.$disconnect();
    await pool.end();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
