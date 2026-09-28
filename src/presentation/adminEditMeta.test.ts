import { describe, expect, it } from "vitest";
import { presentAdminEditMeta } from "./adminEditMeta";

describe("presentAdminEditMeta", () => {
  it("hides role notices until the admin model is settled", () => {
    expect(
      presentAdminEditMeta({
        settled: false,
        canEdit: false,
        whenEditable: "Doar proprietarul poate modifica.",
        whenReadOnly: "Editarea nu este disponibilă pentru acest rol.",
      }),
    ).toBeUndefined();
  });

  it("shows the correct settled notice for owner and non-owner", () => {
    expect(
      presentAdminEditMeta({
        settled: true,
        canEdit: true,
        whenEditable: "Doar proprietarul poate modifica.",
        whenReadOnly: "Editarea nu este disponibilă pentru acest rol.",
      }),
    ).toBe("Doar proprietarul poate modifica.");

    expect(
      presentAdminEditMeta({
        settled: true,
        canEdit: false,
        whenEditable: "Doar proprietarul poate modifica.",
        whenReadOnly: "Editarea nu este disponibilă pentru acest rol.",
      }),
    ).toBe("Editarea nu este disponibilă pentru acest rol.");
  });
});
