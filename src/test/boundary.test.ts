import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function isProductSource(file: string): boolean {
  if (!/\.(ts|tsx|css)$/.test(file)) {
    return false;
  }
  if (file.includes(".test.")) {
    return false;
  }
  if (file.startsWith(join("src", "test")) || file.startsWith("src/test") || file.startsWith("src\\test")) {
    return false;
  }
  if (file.includes(`${join("src", "fixtures")}`) || file.includes("src/fixtures") || file.includes("src\\fixtures")) {
    return false;
  }
  return file.startsWith("src");
}

describe("business boundary", () => {
  it("does not import workos-final domain or ProductDefinition authority", () => {
    const files = walk("src").filter((file) => /\.(ts|tsx|css)$/.test(file));

    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/@workos-final\/domain/);
      expect(text, file).not.toMatch(/from ["'][^"']*ProductDefinition["']/);
      expect(text, file).not.toMatch(/\/api\/dev\/operator-session/);
      expect(text, file).not.toMatch(/12\.5\s*\*\s*3/);
      expect(text, file).not.toMatch(/perimeter\s*\*\s*3/);
      expect(text, file).not.toMatch(/if\s*\(\s*depth\s*===\s*60/);
    }
  });

  it("does not add a frontend pricing or technical formula engine", () => {
    const files = walk("src").filter(isProductSource);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toContain("function evaluatePrice");
      expect(text, file).not.toContain("function evaluateFormula");
      expect(text, file).not.toContain("new Function(");
    }
  });

  it("keeps reference-slice fixtures out of product surfaces", () => {
    const files = walk("src").filter(isProductSource);
    const surfaceFiles = files.filter((file) =>
      /surfaces|layout|App\.tsx|session|routing/.test(file.replace(/\\/g, "/")),
    );

    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/fixtures\/referenceSlice/);
      expect(text, file).not.toMatch(/test\/referenceSliceHarness/);
      expect(text, file).not.toMatch(/SYNTHETIC_CUSTOMER_NAME/);
      expect(text, file).not.toMatch(/SYNTHETIC_REQUEST_TITLE/);
      expect(text, file).not.toMatch(/SYNTHETIC_SELLER/);
      expect(text, file).not.toMatch(/SYNTHETIC_RATE_NOTE/);
      expect(text, file).not.toMatch(/REFERENCE_SLICE_VALUES/);
      expect(text, file).not.toMatch(/Client sintetic/);
      expect(text, file).not.toMatch(/Cerere sintetică/);
      expect(text, file).not.toMatch(/Reference Slice V1 SRL/);
      expect(text, file).not.toMatch(/RO00000001/);
      expect(text, file).not.toMatch(/synthetic reference text/);
      expect(text, file).not.toMatch(/Reference Slice V1 synthetic validation/);
    }

    const noCustomerManufacture = surfaceFiles.filter((file) =>
      /ConfiguratorPage|QuoteSnapshotPage|ResourcesAdminPage|CatalogPage/.test(
        file.replace(/\\/g, "/"),
      ),
    );
    for (const file of noCustomerManufacture) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/createCustomer/);
      expect(text, file).not.toMatch(/createRequest/);
    }

    for (const file of surfaceFiles) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/updateSeller/);
      expect(text, file).not.toMatch(/Îngheață oferta A/);
      expect(text, file).not.toMatch(/Îngheață oferta B/);
      expect(text, file).not.toMatch(/Verifică versiunea anterioară/);
    }
  });
});
