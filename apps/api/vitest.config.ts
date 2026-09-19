import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/vitest-setup.ts"],
    env: {
      // Empty string is falsy in resolveProductSystemSqlitePath — prefer VITEST :memory:.
      WORKOS_SQLITE_PATH: "",
      VITEST: "true",
    },
  },
});
