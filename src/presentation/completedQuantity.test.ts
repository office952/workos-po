import { describe, expect, it } from "vitest";
import { draftCompletedQuantity, parseCompletedQuantity } from "./completedQuantity";

describe("completedQuantity", () => {
  it("formats the planned quantity as the operator draft", () => {
    expect(draftCompletedQuantity(12.5)).toBe("12,5");
    expect(draftCompletedQuantity(125)).toBe("125");
  });

  it("parses Romanian and plain decimals without inventing variance", () => {
    expect(parseCompletedQuantity("11,8")).toBe(11.8);
    expect(parseCompletedQuantity("11.8")).toBe(11.8);
    expect(parseCompletedQuantity("0")).toBe(0);
  });

  it("rejects invalid operator actuals", () => {
    expect(parseCompletedQuantity("")).toBeNull();
    expect(parseCompletedQuantity("abc")).toBeNull();
    expect(parseCompletedQuantity("-1")).toBeNull();
    expect(parseCompletedQuantity("12,5 m")).toBeNull();
  });
});
