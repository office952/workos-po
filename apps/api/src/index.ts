import { startWorkosApi } from "./startApi.js";

try {
  await startWorkosApi();
} catch (error) {
  const code =
    error instanceof Error && "code" in error && typeof error.code === "string"
      ? error.code
      : "";
  console.error(code || (error instanceof Error ? error.message : error));
  process.exit(1);
}
