#!/bin/sh
set -eu

echo "Waiting for database…"
retries=60
until node -e "const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL}); p.query('SELECT 1').then(()=>{p.end(); process.exit(0)}).catch(()=>process.exit(1))" 2>/dev/null; do
  retries=$((retries - 1))
  if [ "$retries" -le 0 ]; then
    echo "Database did not become ready in time"
    exit 1
  fi
  sleep 2
done

echo "Running migrations…"
npx prisma migrate deploy

echo "Ensuring demo users, narrative todos, and 10k scale load…"
node <<'NODE'
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const { addDays } = require("date-fns");
const { hash } = require("bcryptjs");
const { ensureScaleLoadTodos, SCALE_TARGET } = require("./prisma/seed-scale.cjs");

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const passwordHash = await hash("demo1234", 10);
    const alice = await prisma.user.upsert({
      where: { email: "alice@example.com" },
      update: {},
      create: {
        email: "alice@example.com",
        name: "Alice Demo",
        passwordHash,
      },
    });
    await prisma.user.upsert({
      where: { email: "bob@example.com" },
      update: {},
      create: {
        email: "bob@example.com",
        name: "Bob Demo",
        passwordHash,
      },
    });

    let prerequisite = await prisma.todo.findFirst({
      where: { name: "Prepare interview notes", deletedAt: null },
    });
    if (!prerequisite) {
      prerequisite = await prisma.todo.create({
        data: {
          name: "Prepare interview notes",
          description:
            "Outline architecture, ambiguity resolutions, and demo talking points for the SleekFlow assessment.",
          dueDate: addDays(new Date(), 1),
          status: "IN_PROGRESS",
          priority: "HIGH",
          isRecurring: false,
          ownerId: null,
        },
      });
    }

    const weekly = await prisma.todo.findFirst({
      where: { name: "Weekly project status check-in", deletedAt: null },
    });
    if (!weekly) {
      await prisma.todo.create({
        data: {
          name: "Weekly project status check-in",
          description:
            "Review open tasks, update priorities, and capture blockers. Completing this creates the next weekly occurrence.",
          dueDate: addDays(new Date(), 2),
          status: "NOT_STARTED",
          priority: "MEDIUM",
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
    }

    const alicePrivate = await prisma.todo.findFirst({
      where: { name: "Alice private follow-up", deletedAt: null },
    });
    if (!alicePrivate) {
      await prisma.todo.create({
        data: {
          name: "Alice private follow-up",
          description: "Owned todo visible when Alice is signed in.",
          dueDate: addDays(new Date(), 3),
          status: "NOT_STARTED",
          priority: "LOW",
          ownerId: alice.id,
        },
      });
    }

    const scale = await ensureScaleLoadTodos(prisma);
    const total = await prisma.todo.count();
    console.log(
      `Demo ready: ${total} todos total; scale rows ${scale.total}/${SCALE_TARGET} (inserted ${scale.inserted} this boot).`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE

echo "Starting Next.js…"
exec node server.js
