import { describe, expect, it } from "vitest";
import {
  presentStartOverview,
  StartContractError,
  type StartAttentionEntryTransport,
  type StartOverviewTransport,
} from "../adapters/startAdapter";
import {
  presentAttentionFootnote,
  presentAttentionGroups,
  presentFlowStage,
  presentStartFreshness,
  presentStartHeadline,
  presentStartPartialNotice,
  startTargetHref,
} from "./startPage";

function entry(level: StartAttentionEntryTransport["level"], key: string): StartAttentionEntryTransport {
  return {
    key,
    level,
    objectKind: level === "ACTION" ? "PRICE_APPROVAL" : "JOB",
    objectKindLabel: "Lucrare",
    reference: null,
    reasonLabel: "Termen depășit",
    title: `Obiect ${key}`,
    detail: "",
    since: "2026-11-10T10:00:00.000Z",
    actionLabel: "Deschide",
    actionNote: null,
    target: { kind: "JOB", jobId: key, section: null },
  };
}

function start(entries: StartAttentionEntryTransport[], overrides: Partial<StartOverviewTransport> = {}): StartOverviewTransport {
  const count = (level: string) => entries.filter((item) => item.level === level).length;
  return {
    readAt: "2026-11-17T06:42:00.000Z",
    sources: [
      { id: "REQUESTS", label: "Cererile", status: "READY" },
      { id: "QUOTES", label: "Ofertele", status: "READY" },
    ],
    attention: {
      entries,
      counts: { ACTION: count("ACTION"), ATTENTION: count("ATTENTION"), WATCH: count("WATCH") },
      incompleteLevels: [],
    },
    continueWork: null,
    flow: [],
    activity: "PRESENT",
    setup: null,
    canCreateRequest: true,
    ...overrides,
  };
}

describe("startTargetHref", () => {
  it("translates every server target into an existing canonical route", () => {
    expect(startTargetHref({ kind: "PRICE_APPROVALS" })).toBe("/admin/offering");
    expect(startTargetHref({ kind: "REQUEST", requestId: "crq:1" })).toBe("/cereri/crq%3A1");
    expect(startTargetHref({ kind: "REQUEST_PRODUCT", requestId: "crq:1" })).toBe("/cereri/crq%3A1?alege-produs=1#alege-produs");
    expect(startTargetHref({ kind: "ASSEMBLY", assemblyId: "asm:1" })).toBe("/ansamblu?assembly=asm%3A1");
    expect(startTargetHref({ kind: "QUOTE", quoteKind: "ASSEMBLY", productCode: "ASSEMBLY", quoteSnapshotId: "aqs:1" })).toBe(
      "/oferte/ansamblu/aqs%3A1",
    );
    expect(startTargetHref({ kind: "JOB", jobId: "ord:1", section: null })).toBe("/lucrari/ord%3A1");
    expect(startTargetHref({ kind: "REQUESTS_REGISTER" })).toBe("/cereri");
    expect(startTargetHref({ kind: "QUOTES_REGISTER" })).toBe("/oferte");
    expect(startTargetHref({ kind: "JOBS_REGISTER" })).toBe("/lucrari");
  });
});

describe("presentAttentionGroups", () => {
  it("never folds away the steps only the actor's role can take", () => {
    const entries = [
      ...["a1", "a2", "a3", "a4", "a5", "a6"].map((key) => entry("ACTION", key)),
      entry("ATTENTION", "t1"),
      entry("WATCH", "w1"),
    ];
    const groups = presentAttentionGroups(entries, false);
    expect(groups.map((group) => [group.level, group.visible.length, group.hidden.length])).toEqual([
      ["ACTION", 6, 0],
      ["ATTENTION", 0, 1],
      ["WATCH", 0, 1],
    ]);
    expect(presentAttentionFootnote(start(entries), groups)).toContain("Sunt afișate 6 din 8 situații.");
  });

  it("fills the five-row budget in server order and omits empty groups", () => {
    const entries = [entry("ATTENTION", "t1"), ...["w1", "w2", "w3", "w4", "w5", "w6"].map((key) => entry("WATCH", key))];
    const groups = presentAttentionGroups(entries, false);
    expect(groups.map((group) => group.level)).toEqual(["ATTENTION", "WATCH"]);
    expect(groups[1]?.visible.map((item) => item.key)).toEqual(["w1", "w2", "w3", "w4"]);
    expect(groups[1]?.hidden).toHaveLength(2);
    expect(presentAttentionGroups(entries, true)[1]?.hidden).toEqual([]);
  });
});

describe("presentStartHeadline", () => {
  it("names only the most important group that has content", () => {
    expect(presentStartHeadline(start([entry("ACTION", "a"), entry("ACTION", "b"), entry("WATCH", "w")]))).toEqual({
      title: "Două aprobări de preț cer acțiunea ta",
      lead: "O lucrare cu probleme raportate este de urmărit.",
    });
    expect(presentStartHeadline(start(Array.from({ length: 23 }, (_, index) => entry("ATTENTION", `t${index}`)))).title).toBe(
      "23 de situații necesită atenție",
    );
  });

  it("does not claim that nothing waits when a source is missing", () => {
    const partial = start([], {
      sources: [
        { id: "REQUESTS", label: "Cererile", status: "READY" },
        { id: "QUOTES", label: "Ofertele", status: "UNAVAILABLE" },
        { id: "JOBS", label: "Lucrările", status: "UNAVAILABLE" },
      ],
      activity: "UNKNOWN",
    });
    expect(presentStartHeadline(partial)).toEqual({
      title: "Datele sunt citite parțial",
      lead: "Ofertele și lucrările nu au putut fi citite. Acțiunile care depind de ele pot lipsi din listă.",
    });
    expect(presentStartFreshness(partial, false).state).toBe("partial");
    expect(presentStartPartialNotice(partial)?.detail).toContain("Cererile sunt la zi.");
    expect(presentStartFreshness(start([]), true)).toMatchObject({ state: "stale" });
  });

  it("tells a role that cannot create requests that the organization is empty, without an action", () => {
    expect(presentStartHeadline(start([], { activity: "NONE", canCreateRequest: false })).title).toBe(
      "Organizația nu are încă activitate",
    );
  });
});

describe("presentFlowStage", () => {
  it("shares a bar inside one stage only and keeps an unavailable stage without a number", () => {
    const view = presentFlowStage({
      id: "REQUESTS",
      label: "Cereri",
      status: "READY",
      total: 4,
      unitLabel: "cereri deschise",
      segments: [
        { id: "NEW", label: "Nouă", count: 1, tone: "neutral" },
        { id: "IN_REVIEW", label: "În lucru", count: 3, tone: "progress" },
      ],
      highlight: null,
      emptyLabel: "",
      emptyHint: "",
      target: { kind: "REQUESTS_REGISTER" },
    });
    expect(view.segments.map((segment) => segment.share)).toEqual([0.25, 0.75]);
    expect(view.href).toBe("/cereri");
    expect(view.empty).toBe(false);
  });
});

describe("presentStartOverview", () => {
  it("drops a number sent for an unavailable stage and refuses an unknown target", () => {
    const base = {
      readAt: "2026-11-17T06:42:00.000Z",
      attention: { entries: [], counts: { ACTION: 0, ATTENTION: 0, WATCH: 0 } },
      activity: "UNKNOWN",
    };
    const parsed = presentStartOverview({
      start: {
        ...base,
        flow: [{ id: "QUOTES", label: "Oferte", status: "UNAVAILABLE", total: 0, target: { kind: "QUOTES_REGISTER" } }],
      },
    });
    expect(parsed.flow[0]?.total).toBeNull();
    expect(() =>
      presentStartOverview({
        start: { ...base, flow: [{ id: "QUOTES", label: "Oferte", status: "READY", total: 1, target: { kind: "ELSEWHERE" } }] },
      }),
    ).toThrow(StartContractError);
    expect(() => presentStartOverview({})).toThrow(StartContractError);
  });
});
