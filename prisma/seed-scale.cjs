/**
 * Shared scale-load helpers for prisma/seed.ts and docker/entrypoint.sh.
 * Kept as CommonJS so the production entrypoint can require() it without tsx.
 */
/* eslint-disable @typescript-eslint/no-require-imports */

const { addDays } = require("date-fns");

const SCALE_PREFIX = "Scale load #";
const SCALE_TARGET = 10_000;
const SCALE_BATCH = 500;
const LEGACY_SCALE_PREFIX = "scale-verify:";
const SCALE_BASE_DATE = new Date("2026-01-01T00:00:00.000Z");

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "ARCHIVED"];

function scaleName(index) {
  return `${SCALE_PREFIX}${String(index).padStart(5, "0")}`;
}

function dueDateForScaleIndex(index) {
  return addDays(SCALE_BASE_DATE, index);
}

/**
 * Ensure each Scale load #NNNNN sits on a unique calendar day (base + N).
 * @param {import("@prisma/client").PrismaClient} prisma
 */
async function repairScaleDueDates(prisma) {
  const scaleCount = await prisma.todo.count({
    where: { name: { startsWith: SCALE_PREFIX } },
  });

  if (scaleCount === 0) {
    return { repaired: 0, skipped: true };
  }

  const distinct = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT "dueDate")::int AS count
    FROM "Todo"
    WHERE name LIKE ${`${SCALE_PREFIX}%`}
  `;
  const distinctCount = Number(distinct[0]?.count ?? 0);

  // Already one unique day per scale row — nothing to do.
  if (distinctCount >= scaleCount) {
    return { repaired: 0, skipped: true };
  }

  // Prefix length is 12 ("Scale load #"); index is the trailing digits.
  const repaired = await prisma.$executeRaw`
    UPDATE "Todo"
    SET "dueDate" = DATE '2026-01-01'
      + (CAST(SUBSTRING(name FROM 13) AS INTEGER) * INTERVAL '1 day')
    WHERE name LIKE ${`${SCALE_PREFIX}%`}
  `;

  return { repaired: Number(repaired), skipped: false };
}

/**
 * Insert Scale load # rows until at least SCALE_TARGET exist, then repair dates.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @returns {Promise<{ existing: number, inserted: number, total: number, repaired: number }>}
 */
async function ensureScaleLoadTodos(prisma) {
  const existing = await prisma.todo.count({
    where: { name: { startsWith: SCALE_PREFIX } },
  });

  let inserted = 0;

  if (existing < SCALE_TARGET) {
    for (let offset = existing; offset < SCALE_TARGET; offset += SCALE_BATCH) {
      const count = Math.min(SCALE_BATCH, SCALE_TARGET - offset);
      await prisma.todo.createMany({
        data: Array.from({ length: count }, (_, index) => {
          const n = offset + index;
          return {
            name: scaleName(n),
            description: `Bulk seed row ${n} for 10k+ scale demo`,
            dueDate: dueDateForScaleIndex(n),
            status: STATUSES[n % STATUSES.length],
            priority: PRIORITIES[n % PRIORITIES.length],
            isRecurring: false,
            ownerId: null,
          };
        }),
      });
      inserted += count;
    }
  }

  const repair = await repairScaleDueDates(prisma);

  return {
    existing,
    inserted,
    total: existing + inserted,
    repaired: repair.repaired,
  };
}

/**
 * Delete only scale marker rows (Scale load # and legacy scale-verify:).
 * @param {import("@prisma/client").PrismaClient} prisma
 */
async function deleteScaleMarkerTodos(prisma) {
  await prisma.todoDependency.deleteMany({
    where: {
      OR: [
        { todo: { name: { startsWith: SCALE_PREFIX } } },
        { dependsOnTodo: { name: { startsWith: SCALE_PREFIX } } },
        { todo: { name: { startsWith: LEGACY_SCALE_PREFIX } } },
        { dependsOnTodo: { name: { startsWith: LEGACY_SCALE_PREFIX } } },
      ],
    },
  });

  const deletedScale = await prisma.todo.deleteMany({
    where: { name: { startsWith: SCALE_PREFIX } },
  });
  const deletedLegacy = await prisma.todo.deleteMany({
    where: { name: { startsWith: LEGACY_SCALE_PREFIX } },
  });

  return deletedScale.count + deletedLegacy.count;
}

module.exports = {
  SCALE_PREFIX,
  SCALE_TARGET,
  LEGACY_SCALE_PREFIX,
  SCALE_BASE_DATE,
  ensureScaleLoadTodos,
  repairScaleDueDates,
  deleteScaleMarkerTodos,
  scaleName,
  dueDateForScaleIndex,
};
