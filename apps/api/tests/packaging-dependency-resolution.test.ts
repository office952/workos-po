import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectProductionPackages } from "../../../packaging/build-package.mjs";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "workos-pkg-resolve-"));
  temps.push(dir);
  return dir;
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe("production dependency collection", () => {
  it("resolves a nested dependency from the declaring package, not from the root", () => {
    const root = tempWorkspace();
    writeJson(join(root, "package.json"), {
      name: "root-app",
      dependencies: { "pkg-alpha": "1.0.0" },
    });
    writeJson(join(root, "node_modules", "pkg-alpha", "package.json"), {
      name: "pkg-alpha",
      version: "1.0.0",
      dependencies: { "pkg-beta": "1.0.0" },
    });
    writeJson(join(root, "node_modules", "pkg-alpha", "node_modules", "pkg-beta", "package.json"), {
      name: "pkg-beta",
      version: "1.0.0",
    });
    const collected = collectProductionPackages(root, ["pkg-alpha"]);
    expect(collected.get("pkg-alpha")).toBe(resolve(join(root, "node_modules", "pkg-alpha")));
    expect(collected.get("pkg-beta")).toBe(
      resolve(join(root, "node_modules", "pkg-alpha", "node_modules", "pkg-beta")),
    );
    expect(() => collectProductionPackages(root, ["pkg-beta"])).toThrow(/cannot_resolve_pkg-beta:parent=root-app:kind=required/);
  });

  it("skips a missing optional dependency and fails closed on a missing required dependency", () => {
    const root = tempWorkspace();
    writeJson(join(root, "package.json"), {
      name: "optional-root",
      dependencies: { "pkg-alpha": "1.0.0" },
    });
    writeJson(join(root, "node_modules", "pkg-alpha", "package.json"), {
      name: "pkg-alpha",
      version: "1.0.0",
      optionalDependencies: { "pkg-optional-missing": "1.0.0" },
    });
    const collected = collectProductionPackages(root, ["pkg-alpha"]);
    expect(collected.has("pkg-alpha")).toBe(true);
    expect(collected.has("pkg-optional-missing")).toBe(false);
    expect(() => collectProductionPackages(root, ["pkg-missing-required"])).toThrow(
      /cannot_resolve_pkg-missing-required:parent=optional-root:kind=required/,
    );
  });

  it("fails closed when two parents resolve the same name to different package roots", () => {
    const root = tempWorkspace();
    writeJson(join(root, "package.json"), {
      name: "conflict-root",
      dependencies: { "pkg-left": "1.0.0", "pkg-right": "1.0.0" },
    });
    writeJson(join(root, "node_modules", "pkg-left", "package.json"), {
      name: "pkg-left",
      version: "1.0.0",
      dependencies: { "pkg-shared": "1.0.0" },
    });
    writeJson(join(root, "node_modules", "pkg-right", "package.json"), {
      name: "pkg-right",
      version: "1.0.0",
      dependencies: { "pkg-shared": "2.0.0" },
    });
    writeJson(join(root, "node_modules", "pkg-left", "node_modules", "pkg-shared", "package.json"), {
      name: "pkg-shared",
      version: "1.0.0",
    });
    writeJson(join(root, "node_modules", "pkg-right", "node_modules", "pkg-shared", "package.json"), {
      name: "pkg-shared",
      version: "2.0.0",
    });
    expect(() => collectProductionPackages(root, ["pkg-left", "pkg-right"])).toThrow(
      "production_dependency_version_conflict:pkg-shared",
    );
  });

  it("collects pdf-lib's transitive tslib without a direct API tslib dependency", () => {
    const apiDir = join(process.cwd());
    const apiPkg = JSON.parse(readFileSync(join(apiDir, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(apiPkg.dependencies?.tslib).toBeUndefined();
    expect(apiPkg.dependencies?.["pdf-lib"]).toBeTruthy();
    const collected = collectProductionPackages(apiDir, ["pdf-lib"]);
    expect(collected.has("pdf-lib")).toBe(true);
    expect(collected.has("tslib")).toBe(true);
    const tslibPkg = JSON.parse(readFileSync(join(collected.get("tslib") ?? "", "package.json"), "utf8")) as {
      name?: string;
    };
    expect(tslibPkg.name).toBe("tslib");
  });
});
