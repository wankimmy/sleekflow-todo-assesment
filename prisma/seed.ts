import { createRequire } from "module";
import { config } from "dotenv";
import {
  PrismaClient,
  TodoPriority,
  TodoStatus,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";
import { addDays } from "date-fns";
import { Pool } from "pg";

const require = createRequire(import.meta.url);
const { ensureScaleLoadTodos, SCALE_TARGET } = require("./seed-scale.cjs") as {
  ensureScaleLoadTodos: (prisma: PrismaClient) => Promise<{
    existing: number;
    inserted: number;
    total: number;
  }>;
  SCALE_TARGET: number;
};

config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.outboxEvent.deleteMany();
    await prisma.session.deleteMany();
    await prisma.todoDependency.deleteMany();
    await prisma.todo.deleteMany();
    await prisma.user.deleteMany();

    const passwordHash = await hash("demo1234", 10);

    const alice = await prisma.user.create({
      data: {
        email: "alice@example.com",
        name: "Alice Demo",
        passwordHash,
      },
    });

    const bob = await prisma.user.create({
      data: {
        email: "bob@example.com",
        name: "Bob Demo",
        passwordHash,
      },
    });

    const prerequisite = await prisma.todo.create({
      data: {
        name: "Prepare interview notes",
        description:
          "Outline architecture, ambiguity resolutions, and demo talking points for the SleekFlow assessment.",
        dueDate: addDays(new Date(), 1),
        status: TodoStatus.IN_PROGRESS,
        priority: TodoPriority.HIGH,
        isRecurring: false,
        ownerId: null,
      },
    });

    await prisma.todo.create({
      data: {
        name: "Weekly project status check-in",
        description:
          "Review open tasks, update priorities, and capture blockers. Completing this creates the next weekly occurrence.",
        dueDate: addDays(new Date(), 2),
        status: TodoStatus.NOT_STARTED,
        priority: TodoPriority.MEDIUM,
        isRecurring: true,
        recurrenceFrequency: "WEEKLY",
        recurrenceInterval: 1,
        recurrenceUnit: "WEEKS",
        ownerId: null,
        dependsOn: {
          create: [{ dependsOnTodoId: prerequisite.id }],
        },
      },
    });

    await prisma.todo.create({
      data: {
        name: "Alice private follow-up",
        description:
          "Owned todo visible only when Alice is signed in (plus shared board).",
        dueDate: addDays(new Date(), 3),
        status: TodoStatus.NOT_STARTED,
        priority: TodoPriority.LOW,
        ownerId: alice.id,
      },
    });

    const scale = await ensureScaleLoadTodos(prisma);

    console.log(
      `Seeded 2 shared todos + 1 Alice-owned todo + ${scale.total} scale rows (target ${SCALE_TARGET}); users ${alice.email} / ${bob.email} (password: demo1234).`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
