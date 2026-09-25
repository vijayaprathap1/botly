import { defineConfig } from "vitest/config";
import path from "node:path";

// Runs against a real local Postgres created by scripts/local-db.sh (DATABASE_URL).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname), "server-only": path.resolve(__dirname, "tests/stubs/empty.ts") } },
  test: { include: ["tests/db/**/*.test.ts"], environment: "node", fileParallelism: false, testTimeout: 20000 },
});
