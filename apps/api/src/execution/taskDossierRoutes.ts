import { TASK_ARTIFACT_HTTP_BODY_BYTES, type TaskDossierError } from "@workos-final/domain";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie } from "hono/cookie";
import { getProductSystem, isOwner, type ApiContext, type ApiEnv } from "../cloud/context.js";
import { requireOwnerRole } from "../cloud/middleware.js";
import { httpPathIdentity } from "../httpPathIdentity.js";
import { actorUserId } from "../product.js";
import { OPERATOR_SESSION_COOKIE } from "../operator/store.js";

export function registerTaskDossierRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/execution-tasks/:taskId/dossier", (c) => {
    const runtime = getProductSystem(c);
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/dossier");
    const dossier = runtime.readTaskDossier(taskId);
    if (!dossier) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ dossier });
  });

  app.post("/api/execution-tasks/:taskId/observations", async (c) => {
    const actor = operatorActor(c);
    if (!actor) {
      return c.json({ error: "invalid_session" }, 403);
    }
    const body = await c.req.json().catch(() => null);
    const text = typeof body === "object" && body !== null ? (body as { text?: unknown }).text : null;
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/observations");
    const result = getProductSystem(c).addTaskDossierEntry(
      taskId,
      "OBSERVATION",
      text,
      actor,
      new Date().toISOString(),
    );
    return dossierResult(c, result);
  });

  app.post("/api/execution-tasks/:taskId/instructions", requireOwnerRole(), async (c) => {
    const body = await c.req.json().catch(() => null);
    const text = typeof body === "object" && body !== null ? (body as { text?: unknown }).text : null;
    const runtime = getProductSystem(c);
    const session = runtime.resolveOperatorSession(getCookie(c, OPERATOR_SESSION_COOKIE));
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/instructions");
    const result = runtime.addTaskDossierEntry(
      taskId,
      "INSTRUCTION",
      text,
      {
        accountId: actorUserId(c),
        operatorId: session.ok ? session.person.personId : null,
      },
      new Date().toISOString(),
    );
    return dossierResult(c, result);
  });

  app.post("/api/execution-tasks/:taskId/issues", async (c) => {
    const actor = operatorActor(c);
    if (!actor) {
      return c.json({ error: "invalid_session" }, 403);
    }
    const body = await c.req.json().catch(() => null);
    const record = typeof body === "object" && body !== null ? (body as { text?: unknown; reason?: unknown }) : null;
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/issues");
    const result = getProductSystem(c).addTaskDossierEntry(
      taskId,
      "ISSUE_REPORT",
      record?.text,
      actor,
      new Date().toISOString(),
      record?.reason,
    );
    return dossierResult(c, result);
  });

  app.post(
    "/api/execution-tasks/:taskId/artifacts",
    bodyLimit({
      maxSize: TASK_ARTIFACT_HTTP_BODY_BYTES,
      onError: (c) => c.json({ error: "file_too_large" }, 413),
    }),
    async (c) => {
      const actor = writerActor(c);
      if (!actor) {
        return c.json({ error: "invalid_session" }, 403);
      }
      const body = await c.req.parseBody();
      const file = body["file"];
      if (!(file instanceof File) || file.size === 0) {
        return c.json({ error: "invalid_file" }, 400);
      }
      const supersedes =
        typeof body["supersedesArtifactId"] === "string" && body["supersedesArtifactId"].trim()
          ? body["supersedesArtifactId"].trim()
          : null;
      const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/artifacts");
      const result = getProductSystem(c).addTaskArtifact(
        taskId,
        {
          originalFileName: file.name || "fisier",
          mimeType: file.type || null,
          bytes: new Uint8Array(await file.arrayBuffer()),
          supersedesArtifactId: supersedes,
          purpose: body["purpose"],
          note: body["note"],
        },
        actor,
        new Date().toISOString(),
      );
      return dossierResult(c, result);
    },
  );

  app.post("/api/execution-tasks/:taskId/artifact-links", async (c) => {
    const actor = writerActor(c);
    if (!actor) {
      return c.json({ error: "invalid_session" }, 403);
    }
    const body = await c.req.json().catch(() => null);
    const artifactId =
      typeof body === "object" && body !== null && typeof (body as { artifactId?: unknown }).artifactId === "string"
        ? (body as { artifactId: string }).artifactId.trim()
        : "";
    if (!artifactId) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/artifact-links");
    const result = getProductSystem(c).linkTaskArtifact(
      taskId,
      artifactId,
      actor,
      new Date().toISOString(),
    );
    return dossierResult(c, result);
  });

  app.post("/api/execution-tasks/:taskId/artifact-use", async (c) => {
    const actor = writerActor(c);
    if (!actor) {
      return c.json({ error: "invalid_session" }, 403);
    }
    const body = await c.req.json().catch(() => null);
    const artifactId =
      typeof body === "object" && body !== null && typeof (body as { artifactId?: unknown }).artifactId === "string"
        ? (body as { artifactId: string }).artifactId.trim()
        : "";
    if (!artifactId) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/artifact-use");
    const result = getProductSystem(c).markTaskArtifactUsed(
      taskId,
      artifactId,
      actor,
      new Date().toISOString(),
    );
    return dossierResult(c, result);
  });

  app.get("/api/execution-artifacts/:artifactId/download", (c) => {
    const artifactId = httpPathIdentity(c.req.path, "/api/execution-artifacts/", "/download");
    const result = getProductSystem(c).readTaskArtifactDownload(artifactId);
    if (!result.ok) {
      return c.json({ error: result.error }, dossierStatus(result.error));
    }
    const disposition = result.mimeType.startsWith("image/") ? "inline" : "attachment";
    const utf8 = encodeURIComponent(result.fileName);
    return c.body(Buffer.from(result.bytes), 200, {
      "Content-Type": result.mimeType,
      "Content-Disposition": `${disposition}; filename="${result.asciiName}"; filename*=UTF-8''${utf8}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
  });
}

function operatorActor(c: ApiContext) {
  const runtime = getProductSystem(c);
  const session = runtime.resolveOperatorSession(getCookie(c, OPERATOR_SESSION_COOKIE));
  if (!session.ok) {
    return null;
  }
  return {
    accountId: actorUserId(c),
    operatorId: session.person.personId,
  };
}

function writerActor(c: ApiContext) {
  const operator = operatorActor(c);
  if (operator) {
    return operator;
  }
  if (!isOwner(c)) {
    return null;
  }
  return { accountId: actorUserId(c), operatorId: null };
}

function dossierResult(
  c: ApiContext,
  result: { ok: true; dossier: unknown; alreadyApplied?: boolean } | { ok: false; error: TaskDossierError },
) {
  if (!result.ok) {
    return c.json({ error: result.error }, dossierStatus(result.error));
  }
  return c.json({ dossier: result.dossier, alreadyApplied: result.alreadyApplied === true });
}

function dossierStatus(error: TaskDossierError): 400 | 403 | 404 | 409 | 413 | 422 {
  switch (error) {
    case "not_found":
    case "file_missing":
      return 404;
    case "forbidden":
      return 403;
    case "artifact_scope":
      return 409;
    case "file_too_large":
      return 413;
    case "invalid_text":
    case "invalid_reason":
    case "invalid_file":
    case "invalid_purpose":
    case "file_corrupt":
      return 422;
    case "storage_unavailable":
      return 422;
    default: {
      const exhaustive: never = error;
      return exhaustive;
    }
  }
}
