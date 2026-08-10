import { config } from "dotenv";

/**
 * Load env for host tooling and the app.
 * - `.env` uses Docker Compose service hostnames (`postgres`, `postgres-test`)
 * - `.env.local` overrides with localhost published ports for host Node commands
 */
export function loadEnv() {
  config({ path: ".env" });
  config({ path: ".env.local", override: true });
}
