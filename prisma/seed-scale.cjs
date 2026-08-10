/**
 * Shared scale-load helpers for prisma/seed.ts and docker/entrypoint.sh.
 * Kept as CommonJS so the production entrypoint can require() it without tsx.
 */

const { addDays } = require("date-fns");

const SCALE_PREFIX = "Scale load #";
const SCALE_TARGET = 10_000;
const SCALE_BATCH = 500;
const LEGACY_SCALE_PREFIX = "scale-verify:";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "ARCHIVED"];

function scaleName(index) {
  return `${SCALE_PREFIX}${String(index).padStart(5, "0")}`;
}

/**
 * Insert Scale load # rows until at least SCALE_TARGET exist.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @returns {Promise<{ existing: number, inserted: number, total: number }>}
 */
async function ensureScaleLoadTodos(prisma) {
  const existing = await prisma.todo.count({
    where: { name: { startsWith: SCALE_PREFIX } },
  });

  if (existing >= SCALE_TARGET) {
    return { existing, inserted: 0, total: existing };
  }

  const baseDate = new Date("2026-08-01T00:00:00.000Z");
  let inserted = 0;

  for (let offset = existing; offset < SCALE_TARGET; offset += SCALE_BATCH) {
    const count = Math.min(SCALE_BATCH, SCALE_TARGET - offset);
    await prisma.todo.createMany({
      data: Array.from({ length: count }, (_, index) => {
        const n = offset + index;
        return {
          name: scaleName(n),
          description: `Bulk seed row ${n} for 10k+ scale demo`,
          dueDate: addDays(baseDate, n % 60),
          status: STATUSES[n % STATUSES.length],
          priority: PRIORITIES[n % PRIORITIES.length],
          isRecurring: false,
          ownerId: null,
        };
      }),
    });
    inserted += count;
  }

  return {
    existing,
    inserted,
    total: existing + inserted,
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
  ensureScaleLoadTodos,
  deleteScaleMarkerTodos,
  scaleName,
};
