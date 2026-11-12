import { describe, expect, it } from "vitest";
import {
  presentOrganizationOperatingPicture,
  type OrganizationOperatingFacts,
} from "./organizationOperatingPicture";

const emptyFacts: OrganizationOperatingFacts = {
  peopleCount: 0,
  peopleWithPinCount: 0,
  workcenterCount: 0,
  machineCount: 0,
  enabledProductCount: 2,
  offeredProductCount: 2,
  siteInstallationMode: "SERVICE_DISABLED",
  siteInstallationModeLabel: "Dezactivat",
  materialReadinessMode: "DISABLED",
  materialReadinessModeLabel: "Oprit",
  externalProductionMode: "DISABLED",
  externalProductionModeLabel: "Oprit",
};

describe("presentOrganizationOperatingPicture", () => {
  it("treats an empty operational foundation as a legitimate new organization", () => {
    const picture = presentOrganizationOperatingPicture({
      facts: emptyFacts,
      role: "owner",
      organizationName: "Firma Nouă",
    });

    expect(picture.emptyOrganization).toBe(true);
    expect(picture.statusLabel).toBe("Organizație nouă");
    expect(picture.statusTone).toBe("pending");
    expect(picture.statusLabel).not.toBe("Pregătit");
    expect(picture.nextAction.href).toBe("/clienti");
    expect(picture.nextAction.description).toMatch(/Nu este nevoie să configurezi Atelierul/);
    expect(picture.lead).toMatch(/fără oameni, PIN sau utilaje/);
    expect(picture.historyNote).toMatch(/Ofertele înghețate/);
    expect(picture.capabilities.find((item) => item.id === "people")?.adoptionLabel).toMatch(/Atelier/);
    expect(picture.capabilities.find((item) => item.id === "workcenters")?.disabledBehavior).toMatch(
      /fără parc de mașini/,
    );
  });

  it("does not call a connected session ready when operational counts are unknown", () => {
    const picture = presentOrganizationOperatingPicture({
      facts: {
        peopleCount: null,
        peopleWithPinCount: null,
        workcenterCount: null,
        machineCount: null,
        enabledProductCount: null,
        offeredProductCount: null,
        siteInstallationMode: null,
        siteInstallationModeLabel: null,
        materialReadinessMode: null,
        materialReadinessModeLabel: null,
        externalProductionMode: null,
        externalProductionModeLabel: null,
      },
      role: "owner",
      organizationName: "Atelier Alpha",
    });

    expect(picture.emptyOrganization).toBe(false);
    expect(picture.statusLabel).toBe("Cont conectat");
    expect(picture.statusTone).toBe("pending");
    expect(picture.statusLabel).not.toBe("Pregătit");
  });

  it("sends the owner to product enablement when nothing is offered for new work", () => {
    const picture = presentOrganizationOperatingPicture({
      facts: { ...emptyFacts, enabledProductCount: 0, offeredProductCount: 2 },
      role: "owner",
      organizationName: "Firma Nouă",
    });

    expect(picture.nextAction.href).toBe("/admin/products");
    expect(picture.capabilities.find((item) => item.id === "products")?.adoption).toBe("needed_for_quotes");
  });

  it("keeps progressive configuration after people exist and does not force machines", () => {
    const picture = presentOrganizationOperatingPicture({
      facts: {
        ...emptyFacts,
        peopleCount: 2,
        peopleWithPinCount: 1,
        workcenterCount: 0,
        machineCount: 0,
      },
      role: "owner",
      organizationName: "Atelier Alpha",
    });

    expect(picture.emptyOrganization).toBe(false);
    expect(picture.statusLabel).toBe("Configurare progresivă");
    expect(picture.capabilities.find((item) => item.id === "people")?.current).toBe(
      "1 din 2 cu PIN pentru Atelier.",
    );
    expect(picture.capabilities.find((item) => item.id === "workcenters")?.current).toBe(
      "Nicio zonă și niciun utilaj.",
    );
    expect(picture.nextAction.href).toBe("/clienti");
  });

  it("reserves configuration copy for members without inventing invite", () => {
    const picture = presentOrganizationOperatingPicture({
      facts: emptyFacts,
      role: "member",
      organizationName: "Atelier Alpha",
    });

    expect(picture.roleNote).toMatch(/proprietarului/);
    expect(picture.capabilities.find((item) => item.id === "access")?.current).toMatch(
      /administrarea controlată/,
    );
    expect(picture.capabilities.every((item) => item.whoCanConfigure.includes("proprietar"))).toBe(true);
  });
});
