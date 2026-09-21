import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

export const SYNTHETIC_REFERENCE_MARKER = "SYNTHETIC_REFERENCE";
export const REFERENCE_PORT = 8787;
export const REFERENCE_HOST = "127.0.0.1";
export const REFERENCE_URL = `http://${REFERENCE_HOST}:${REFERENCE_PORT}`;

const MARKER_BODY = [
  "SYNTHETIC_REFERENCE_DATA=YES",
  "REAL_DATA=NO",
  "REAL_HUB_MEDIA=NO",
  "CLASSIFICATION=SYNTHETIC_REFERENCE",
  "",
].join("\n");

export function defaultReferenceRoot(env = process.env) {
  const override = env.WORKOS_REFERENCE_ROOT?.trim();
  if (override) {
    return resolve(override);
  }
  if (process.platform === "win32") {
    const localAppData = env.LOCALAPPDATA?.trim() || join(homedir(), "AppData", "Local");
    return resolve(join(localAppData, "WorkOS", "reference-runtime"));
  }
  const dataHome = env.XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share");
  return resolve(join(dataHome, "WorkOS", "reference-runtime"));
}

export function resolveReferenceRoot(env = process.env) {
  if (env.NODE_ENV === "production") {
    throw new Error("reference_runtime_production_refused");
  }
  return defaultReferenceRoot(env);
}

export function markerPath(root) {
  return join(root, SYNTHETIC_REFERENCE_MARKER);
}

export function hasSyntheticMarker(root) {
  const path = markerPath(root);
  if (!existsSync(path)) {
    return false;
  }
  try {
    const text = readFileSync(path, "utf8");
    return text.includes("SYNTHETIC_REFERENCE");
  } catch {
    return false;
  }
}

export function looksLikeBusinessStorage(root) {
  return (
    existsSync(join(root, "control", "control-plane.sqlite")) ||
    existsSync(join(root, "organizations")) ||
    existsSync(join(root, "product-system.sqlite"))
  );
}

export function classifyReferenceRoot(root) {
  const resolved = resolve(root);
  if (!existsSync(resolved)) {
    return "ABSENT";
  }
  if (hasSyntheticMarker(resolved)) {
    return "SYNTHETIC_REFERENCE";
  }
  if (looksLikeBusinessStorage(resolved)) {
    return "UNCLASSIFIED_BUSINESS_STORAGE";
  }
  return "EMPTY_OR_UNKNOWN";
}

export function assertSafeReferenceRoot(root) {
  const classification = classifyReferenceRoot(root);
  if (classification === "UNCLASSIFIED_BUSINESS_STORAGE") {
    throw new Error("reference_root_unclassified");
  }
  if (classification === "EMPTY_OR_UNKNOWN" && looksLikeBusinessStorage(root)) {
    throw new Error("reference_root_unclassified");
  }
  return classification;
}

export function ensureSyntheticReferenceRoot(root) {
  const classification = assertSafeReferenceRoot(root);
  if (classification === "ABSENT" || classification === "EMPTY_OR_UNKNOWN") {
    mkdirSync(root, { recursive: true });
    writeFileSync(markerPath(root), MARKER_BODY);
  }
  if (!hasSyntheticMarker(root)) {
    throw new Error("reference_root_unclassified");
  }
  return root;
}

export function isInside(base, candidate) {
  const rel = relative(resolve(base), resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
