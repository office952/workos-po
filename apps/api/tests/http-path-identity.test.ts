import { describe, expect, it } from "vitest";
import { httpPathIdentity } from "../src/httpPathIdentity.js";

describe("httpPathIdentity", () => {
  it("keeps colon identities after the route prefix", () => {
    expect(httpPathIdentity("/api/quotes/qts:PRD-LETTERS:hash", "/api/quotes/")).toBe(
      "qts:PRD-LETTERS:hash",
    );
    expect(httpPathIdentity("/api/jobs/ord:acc:hash", "/api/jobs/")).toBe("ord:acc:hash");
    expect(httpPathIdentity("/api/requests/crq:1111-2222", "/api/requests/")).toBe(
      "crq:1111-2222",
    );
  });

  it("decodes percent-encoded colons", () => {
    expect(httpPathIdentity("/api/quotes/qts%3Aabc%3Adef", "/api/quotes/")).toBe("qts:abc:def");
  });

  it("strips an action suffix from execution task paths", () => {
    expect(
      httpPathIdentity("/api/execution-tasks/task:exp:1/provider", "/api/execution-tasks/", "/provider"),
    ).toBe("task:exp:1");
  });
});
