import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

const preexistingDatabaseUrl = process.env.DATABASE_URL;

config({ path: ".env" });
config({ path: ".env.local", override: true });

// Shell / CI DATABASE_URL wins so we can target the test DB for migrate.
if (preexistingDatabaseUrl) {
  process.env.DATABASE_URL = preexistingDatabaseUrl;
}

type Env = {
  DATABASE_URL: string;
};

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env<Env>("DATABASE_URL"),
  },
});
