import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { Context, Hono } from "hono";
import type { ApiEnv } from "../cloud/context.js";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

function safeFile(root: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const relative = decoded.replace(/^\/+/, "");
  const candidate = resolve(root, relative);
  const rootResolved = resolve(root);
  if (candidate !== rootResolved && !candidate.startsWith(rootResolved + sep)) {
    return null;
  }
  return normalize(candidate);
}

export function registerStaticSite(app: Hono<ApiEnv>, staticRoot: string): void {
  app.get("*", (c) => serveStatic(c, staticRoot));
}

function serveStatic(c: Context<ApiEnv>, staticRoot: string): Response | Promise<Response> {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "not_found" }, 404);
  }
  const requested = safeFile(staticRoot, c.req.path === "/" ? "index.html" : c.req.path);
  if (!requested) {
    return c.body("forbidden", 403);
  }
  const filePath =
    existsSync(requested) && statSync(requested).isFile()
      ? requested
      : join(staticRoot, "index.html");
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return c.body("not found", 404);
  }
  const type = CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  return new Promise((resolveResponse, reject) => {
    const stream = createReadStream(filePath);
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("error", reject);
    stream.on("end", () => {
      resolveResponse(
        new Response(Buffer.concat(chunks), {
          status: 200,
          headers: { "content-type": type },
        }),
      );
    });
  });
}
