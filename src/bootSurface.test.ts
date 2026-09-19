import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("cold first paint", () => {
  it("reserves a boot surface in HTML without impersonating product state", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).toContain('class="boot"');
    expect(html).toContain("Se încarcă WorkOS.");
    expect(html).toContain("role=\"status\"");
    expect(html).not.toContain("Atelier Est");
    expect(html).not.toContain("Litere volumetrice");
    expect(html).not.toContain("Nouă");
  });
});
