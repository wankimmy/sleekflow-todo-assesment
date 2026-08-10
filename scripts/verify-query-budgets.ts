import { config } from "dotenv";
import { Pool } from "pg";

const preexistingTestUrl = process.env.TEST_DATABASE_URL;
const preexistingDatabaseUrl = process.env.DATABASE_URL;

config({ path: ".env" });
config({ path: ".env.local", override: true });

// Shell / CI URLs win so we can deliberately point at (or refuse) a specific DB.
if (preexistingTestUrl) {
  process.env.TEST_DATABASE_URL = preexistingTestUrl;
}
if (preexistingDatabaseUrl) {
  process.env.DATABASE_URL = preexistingDatabaseUrl;
}

/**
 * Soft query budgets for CI. Thresholds are intentionally loose so flaky CI
 * hosts do not fail on noise; they still catch catastrophic plans.
 */
const MAX_EXECUTION_MS = 2500;
const MAX_PLANNING_MS = 500;
const SAMPLE_ROWS = 300;
const MARKER_PREFIX = "Budget todo ";

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
  if (!databaseName || !databaseName.endsWith("_test")) {
    console.error(
      `Refusing to run query budgets against database "${databaseName ?? "(unknown)"}". ` +
        `Set TEST_DATABASE_URL (or DATABASE_URL) to a database whose name ends with "_test".`,
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query(
      `DELETE FROM "TodoDependency"
       WHERE "todoId" IN (SELECT id FROM "Todo" WHERE name LIKE $1)
          OR "dependsOnTodoId" IN (SELECT id FROM "Todo" WHERE name LIKE $1)`,
      [`${MARKER_PREFIX}%`],
    );
    await client.query(`DELETE FROM "Todo" WHERE name LIKE $1`, [
      `${MARKER_PREFIX}%`,
    ]);

    for (let i = 0; i < SAMPLE_ROWS; i += 1) {
      await client.query(
        `INSERT INTO "Todo" (id, name, description, "dueDate", status, priority, "isRecurring", version, "createdAt", "updatedAt")
         VALUES ($1, $2, '', $3, 'NOT_STARTED', 'MEDIUM', false, 1, NOW(), NOW())`,
        [
          `budget${String(i).padStart(4, "0")}`,
          `${MARKER_PREFIX}${i}`,
          new Date(Date.UTC(2026, 7, 1 + (i % 28))),
        ],
      );
    }

    const checks: Array<{ name: string; sql: string }> = [
      {
        name: "list_by_due_date",
        sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
              SELECT id FROM "Todo"
              WHERE "deletedAt" IS NULL AND "ownerId" IS NULL
              ORDER BY "dueDate" ASC, id ASC
              LIMIT 25`,
      },
      {
        name: "dashboard_status_group",
        sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
              SELECT status, COUNT(*)::int AS count
              FROM "Todo"
              WHERE "deletedAt" IS NULL AND "ownerId" IS NULL
              GROUP BY status`,
      },
      {
        name: "priority_ranked_page",
        sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
              SELECT id,
                CASE priority
                  WHEN 'HIGH' THEN 3
                  WHEN 'MEDIUM' THEN 2
                  ELSE 1
                END AS rank
              FROM "Todo"
              WHERE "deletedAt" IS NULL AND "ownerId" IS NULL
              ORDER BY rank DESC, id ASC
              LIMIT 25`,
      },
    ];

    const failures: string[] = [];

    for (const check of checks) {
      const result = await client.query(check.sql);
      const plan = result.rows[0]["QUERY PLAN"][0];
      const planning = Number(plan["Planning Time"] ?? 0);
      const execution = Number(plan["Execution Time"] ?? 0);
      console.log(
        `${check.name}: planning=${planning.toFixed(2)}ms execution=${execution.toFixed(2)}ms`,
      );

      if (planning > MAX_PLANNING_MS) {
        failures.push(
          `${check.name} planning ${planning}ms > ${MAX_PLANNING_MS}ms`,
        );
      }
      if (execution > MAX_EXECUTION_MS) {
        failures.push(
          `${check.name} execution ${execution}ms > ${MAX_EXECUTION_MS}ms`,
        );
      }
    }

    await client.query(
      `DELETE FROM "TodoDependency"
       WHERE "todoId" IN (SELECT id FROM "Todo" WHERE name LIKE $1)
          OR "dependsOnTodoId" IN (SELECT id FROM "Todo" WHERE name LIKE $1)`,
      [`${MARKER_PREFIX}%`],
    );
    await client.query(`DELETE FROM "Todo" WHERE name LIKE $1`, [
      `${MARKER_PREFIX}%`,
    ]);

    if (failures.length > 0) {
      console.error("Query budget failures:\n" + failures.join("\n"));
      process.exit(1);
    }

    console.log("Query budgets OK.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
