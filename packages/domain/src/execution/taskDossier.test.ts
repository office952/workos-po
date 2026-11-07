import { describe, expect, it } from "vitest";
import {
  applyIssueTransition,
  isActiveIssueStatus,
  issueManagementActions,
  issueStatusLabel,
  presentIssueAttention,
  resolveIssueStatus,
} from "./taskDossier.js";

describe("operational issue lifecycle", () => {
  it("treats missing legacy status as open and active", () => {
    expect(resolveIssueStatus(null)).toBe("OPEN");
    expect(resolveIssueStatus(undefined)).toBe("OPEN");
    expect(isActiveIssueStatus(resolveIssueStatus(null))).toBe(true);
    expect(issueStatusLabel("OPEN")).toBe("Deschisă");
    expect(issueStatusLabel("ACKNOWLEDGED")).toBe("Preluată");
    expect(issueStatusLabel("RESOLVED")).toBe("Rezolvată");
  });

  it("allows acknowledge then resolve, and resolve directly from open", () => {
    expect(applyIssueTransition({ current: "OPEN", action: "ACKNOWLEDGE" })).toEqual({
      ok: true,
      next: "ACKNOWLEDGED",
      alreadyApplied: false,
    });
    expect(applyIssueTransition({ current: "ACKNOWLEDGED", action: "RESOLVE" })).toEqual({
      ok: true,
      next: "RESOLVED",
      alreadyApplied: false,
    });
    expect(applyIssueTransition({ current: "OPEN", action: "RESOLVE" })).toEqual({
      ok: true,
      next: "RESOLVED",
      alreadyApplied: false,
    });
  });

  it("rejects acknowledging a resolved issue and treats repeats as already applied", () => {
    expect(applyIssueTransition({ current: "RESOLVED", action: "ACKNOWLEDGE" })).toEqual({
      ok: false,
      error: "invalid_issue_status",
    });
    expect(applyIssueTransition({ current: "ACKNOWLEDGED", action: "ACKNOWLEDGE" })).toEqual({
      ok: true,
      next: "ACKNOWLEDGED",
      alreadyApplied: true,
    });
    expect(applyIssueTransition({ current: "RESOLVED", action: "RESOLVE" })).toEqual({
      ok: true,
      next: "RESOLVED",
      alreadyApplied: true,
    });
  });

  it("exposes acknowledge and resolve only to authorized managers of active issues", () => {
    expect(issueManagementActions("OPEN", false)).toEqual({
      canAcknowledge: false,
      canResolve: false,
    });
    expect(issueManagementActions("OPEN", true)).toEqual({
      canAcknowledge: true,
      canResolve: true,
    });
    expect(issueManagementActions("ACKNOWLEDGED", true)).toEqual({
      canAcknowledge: false,
      canResolve: true,
    });
    expect(issueManagementActions("RESOLVED", true)).toEqual({
      canAcknowledge: false,
      canResolve: false,
    });
  });

  it("counts many reports as one attention reason", () => {
    expect(presentIssueAttention(0)).toBeNull();
    expect(presentIssueAttention(1)).toBe("Problemă semnalată");
    expect(presentIssueAttention(3)).toBe("Probleme semnalate");
  });
});
