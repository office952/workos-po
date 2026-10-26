import { describe, expect, it } from "vitest";
import { summarizeMatch } from "./matchSummary";

describe("compact match explanation (N-020)", () => {
  it("groups the server labels by kind, in the server order, without adding any", () => {
    const labels = summarizeMatch([
      "Sediu",
      "Anul 2021",
      "Titlu",
      "Referință",
      "Fotografie: Litere montate pe depozit (2021)",
      "Fotografie: Fațada depozitului înainte de montaj (2021)",
      "Proces-verbal de recepție: PV recepție litere depozit",
      "Factură: Factură litere și casetă depozit",
    ]).map((group) => group.label);
    expect(labels).toEqual(["sediu", "anul 2021", "titlu", "referință", "fotografii (2)", "documente (2)"]);
  });

  it("says one document or one offer without a count, and keeps unknown labels as they are", () => {
    expect(summarizeMatch(["Factură: F-1"]).map((group) => group.label)).toEqual(["documente"]);
    expect(summarizeMatch(["Ofertă OF-1", "Ofertă OF-1"]).map((group) => group.label)).toEqual(["oferte"]);
    expect(summarizeMatch(["Ofertă OF-1", "Ofertă OF-2", "Lucrare"]).map((group) => group.label)).toEqual(["oferte (2)", "lucrare"]);
    expect(summarizeMatch(["Câmp nou"]).map((group) => group.label)).toEqual(["câmp nou"]);
    expect(summarizeMatch([])).toEqual([]);
  });
});
