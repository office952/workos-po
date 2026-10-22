import { describe, expect, it } from "vitest";
import {
  atelierHref,
  jobHref,
  parseJobSheetSection,
  parseOperationalReturn,
  sanitizeOperationalReturn,
} from "./appRoute";

describe("operational return", () => {
  it("preserves a job section and task across personal identification", () => {
    const target = jobHref("job:1", { taskId: "task:2", section: "materiale" });
    const href = atelierHref({ jobId: "job:1", returnTo: target });
    expect(parseOperationalReturn(href.slice(href.indexOf("?")))).toBe(target);
    expect(parseJobSheetSection("?task=task:2&sectiune=materiale")).toBe("materiale");
    expect(parseJobSheetSection("?task=task:2")).toBe("operatie");
    expect(parseJobSheetSection("?sectiune=unknown")).toBe("situatie");
    expect(parseJobSheetSection("")).toBe("situatie");
    expect(sanitizeOperationalReturn("/lucrari/job-1?sectiune=unknown")).toBe("/lucrari/job-1");
  });
  it("keeps a supported internal operation route and drops foreign targets", () => {
    expect(sanitizeOperationalReturn("/executie/exp:1?task=task:1&job=job-1")).toBe(
      "/executie/exp:1?task=task%3A1&job=job-1",
    );
    expect(sanitizeOperationalReturn("/lucrari/job-1?task=task:1")).toBe(
      "/lucrari/job-1?task=task%3A1",
    );
    expect(sanitizeOperationalReturn("https://example.test/executie/exp-1")).toBeNull();
    expect(sanitizeOperationalReturn("//example.test/atelier")).toBeNull();
    expect(sanitizeOperationalReturn("/admin")).toBeNull();
    expect(parseOperationalReturn("?return=/atelier?job=job-1")).toBe("/atelier?job=job-1");
  });

  it("round-trips the atelier return without starting work", () => {
    const href = atelierHref({
      jobId: "job-1",
      returnTo: jobHref("job-1", { taskId: "task-1" }),
    });
    expect(href).toBe("/atelier?job=job-1&return=%2Flucrari%2Fjob-1%3Ftask%3Dtask-1");
    const search = href.slice(href.indexOf("?"));
    expect(parseOperationalReturn(search)).toBe("/lucrari/job-1?task=task-1");
  });
});
