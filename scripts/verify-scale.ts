import { createRequire } from "module";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  TodoPriority,
  TodoStatus,
} from "@prisma/client";

const require = createRequire(import.meta.url);
const {
  SCALE_PREFIX,
  SCALE_TARGET,
  ensureScaleLoadTodos,
  deleteScaleMarkerTodos,
} = require("../prisma/seed-scale.cjs") as {
  SCALE_PREFIX: string;
  SCALE_TARGET: number;
  ensureScaleLoadTodos: (prisma: PrismaClient) => Promise<{
    existing: number;
    inserted: number;
    total: number;
  }>;
  deleteScaleMarkerTodos: (prisma: PrismaClient) => Promise<number>;
};

const preexistingTestUrl = process.env.TEST_DATABASE_URL;
const preexistingDatabaseUrl = process.env.DATABASE_URL;

config({ path: ".env" });
config({ path: ".env.local", override: true });

if (preexistingTestUrl) {
  process.env.TEST_DATABASE_URL = preexistingTestUrl;
}
if (preexistingDatabaseUrl) {
  process.env.DATABASE_URL = preexistingDatabaseUrl;
}

const MAX_LIST_MS = 1500;
const MAX_RANKED_MS = 2500;
const MAX_DASHBOARD_MS = 2000;
const MAX_CALENDAR_MS = 1000;

function databaseNameFromUrl(connectionString: string): string | null {
  try {
    const url = new URL(connectionString);
    const name = url.pathname.replace(/^\//, "").split("?")[0];
    return name || null;
  } catch {
    return null;
  }
}

async function main() {
  const connectionString =
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("TEST_DATABASE_URL or DATABASE_URL is required");
  }

  const databaseName = databaseNameFromUrl(connectionString);
  const isTestDb = Boolean(databaseName?.endsWith("_test"));

  // Point the app prisma singleton at the same DB we measure.
  process.env.DATABASE_URL = connectionString;

  const { findTodos, getDashboardStats, prisma } = await import(
    "../src/features/todos/todo.repository"
  );

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const seedClient = new PrismaClient({ adapter });

  const startedAt = Date.now();
  let cleaned = 0;

  try {
    const scale = await ensureScaleLoadTodos(seedClient);
    console.log(
      `Scale rows ready: ${scale.total}/${SCALE_TARGET} (inserted ${scale.inserted} this run) against ${databaseName ?? "(unknown)"}.`,
    );

    const listStart = Date.now();
    const page = await findTodos({
      page: 1,
      pageSize: 25,
      sortBy: "dueDate",
      sortOrder: "asc",
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.HIGH,
      search: SCALE_PREFIX,
      includeDeleted: false,
      onlyDeleted: false,
    });
    const listMs = Date.now() - listStart;

    const rankedStart = Date.now();
    const rankedPage = await findTodos({
      page: 1,
      pageSize: 25,
      sortBy: "priority",
      sortOrder: "desc",
      dependencyStatus: "unblocked",
      search: SCALE_PREFIX,
      includeDeleted: false,
      onlyDeleted: false,
    });
    const rankedMs = Date.now() - rankedStart;

    const dashboardStart = Date.now();
    const dashboard = await getDashboardStats();
    const dashboardMs = Date.now() - dashboardStart;

    const calendarStart = Date.now();
    const calendar = await seedClient.todo.findMany({
      where: {
        deletedAt: null,
        name: { startsWith: SCALE_PREFIX },
        dueDate: {
          gte: new Date("2026-08-01T00:00:00.000Z"),
          lte: new Date("2026-08-31T23:59:59.999Z"),
        },
      },
      orderBy: { dueDate: "asc" },
      take: 500,
    });
    const calendarMs = Date.now() - calendarStart;

    const report = {
      database: databaseName,
      isTestDb,
      scaleTotal: scale.total,
      listPageSize: page.items.length,
      listTotal: page.total,
      listQueryMs: listMs,
      rankedFilterPageSize: rankedPage.items.length,
      rankedFilterQueryMs: rankedMs,
      dashboardTotal: dashboard.total,
      dashboardQueryMs: dashboardMs,
      calendarSampleSize: calendar.length,
      calendarQueryMs: calendarMs,
      totalMs: Date.now() - startedAt,
      ceilings: {
        listMs: MAX_LIST_MS,
        rankedMs: MAX_RANKED_MS,
        dashboardMs: MAX_DASHBOARD_MS,
        calendarMs: MAX_CALENDAR_MS,
      },
    };

    console.log(JSON.stringify(report, null, 2));

    const failures: string[] = [];
    if (listMs > MAX_LIST_MS) {
      failures.push(`list ${listMs}ms > ${MAX_LIST_MS}ms`);
    }
    if (rankedMs > MAX_RANKED_MS) {
      failures.push(`ranked ${rankedMs}ms > ${MAX_RANKED_MS}ms`);
    }
    if (dashboardMs > MAX_DASHBOARD_MS) {
      failures.push(`dashboard ${dashboardMs}ms > ${MAX_DASHBOARD_MS}ms`);
    }
    if (calendarMs > MAX_CALENDAR_MS) {
      failures.push(`calendar ${calendarMs}ms > ${MAX_CALENDAR_MS}ms`);
    }
    if (scale.total < SCALE_TARGET) {
      failures.push(`scale rows ${scale.total} < ${SCALE_TARGET}`);
    }

    if (failures.length > 0) {
      console.error("Scale performance failures:\n" + failures.join("\n"));
      process.exitCode = 1;
    } else {
      console.log("Scale performance OK.");
    }
  } finally {
    if (isTestDb) {
      console.log("Cleaning scale marker rows from test DB…");
      cleaned = await deleteScaleMarkerTodos(seedClient);
      console.log(`Deleted ${cleaned} scale marker todos.`);
    } else {
      console.log(
        "Leaving Scale load # rows in place (demo DB); not wiping seeded data.",
      );
    }
    await seedClient.$disconnect();
    await pool.end();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
