import { describe, expect, it } from "vitest";
import {
  factError,
  factPending,
  factReady,
  presentOrganizationOperatingPicture,
  type OrganizationOperatingFacts,
} from "./organizationOperatingPicture";

const readyEmptyAtelier: OrganizationOperatingFacts = {
  actorRole: "owner",
  people: factReady({ count: 0, withPinCount: 0 }),
  workcenters: factReady({ count: 0, machineCount: 0 }),
  products: factReady({ enabledCount: 1, offeredCount: 2 }),
  installation: factReady({
    mode: "INTERNAL",
    label: "Intern",
  }),
  materials: factReady({ policy: "DISABLED" }),
  external: factReady({ policy: "DISABLED" }),
};

function capability(picture: ReturnType<typeof presentOrganizationOperatingPicture>, name: string) {
  const card = picture.capabilities.find((item) => item.name === name);
  if (!card) throw new Error(`missing ${name}`);
  return card;
}

describe("presentOrganizationOperatingPicture", () => {
  it("does not call a commercially active org new just because Atelier has no people or machines", () => {
    const picture = presentOrganizationOperatingPicture(readyEmptyAtelier);
    expect(picture.statusLabel).toBe("Comercial disponibil");
    expect(picture.statusLabel).not.toMatch(/nou/i);
    expect(picture.statusTone).not.toBe("ready");
    expect(picture.lead).toMatch(/clienți și oferte/i);
    expect(picture.lead).toMatch(/opțional/i);
    expect(picture.lead).not.toMatch(/Firma Nouă|Organizație nouă/i);
    expect(picture.nextAction).toEqual({
      href: "/clienti",
      label: "Clienți",
      description: "Deschide un client sau o ofertă. Nu depinde de Atelier.",
    });
    expect(capability(picture, "Oameni").adoptionLabel).toBe("Opțional · necesar pentru Atelier");
    expect(capability(picture, "Zone și utilaje").adoptionLabel).toBe("Opțional · necesar pentru Atelier");
  });

  it("treats zero offered products as a commercial gap, not as a new organization", () => {
    const picture = presentOrganizationOperatingPicture({
      ...readyEmptyAtelier,
      products: factReady({ enabledCount: 0, offeredCount: 2 }),
    });
    expect(picture.statusLabel).toBe("Fără produse oferite");
    expect(picture.lead).not.toMatch(/nou/i);
    expect(picture.nextAction.href).toBe("/admin/products");
  });

  it("keeps unknown configuration distinct from explicitly disabled", () => {
    const unknown = presentOrganizationOperatingPicture({
      ...readyEmptyAtelier,
      installation: factReady({ mode: null, label: "Neconfigurat" }),
    });
    expect(capability(unknown, "Montaj la locație")).toMatchObject({
      current: "Neconfigurat.",
      adoptionLabel: "Nu este setat",
    });
    expect(capability(unknown, "Montaj la locație").adoptionLabel).not.toMatch(/dezactivat/i);

    const disabled = presentOrganizationOperatingPicture({
      ...readyEmptyAtelier,
      installation: factReady({ mode: "SERVICE_DISABLED", label: "Dezactivat" }),
    });
    expect(capability(disabled, "Montaj la locație")).toMatchObject({
      current: "Dezactivat",
      adoptionLabel: "Dezactivat explicit",
    });
    expect(capability(disabled, "Materiale execuție")).toMatchObject({
      current: "Oprit explicit. Nu blochează pornirea.",
      adoptionLabel: "Dezactivat explicit",
    });
    expect(capability(disabled, "Execuție externă").adoptionLabel).toBe("Dezactivat explicit");
  });

  it("does not treat pending or failed reads as disabled or unblocking", () => {
    const pending = presentOrganizationOperatingPicture({
      actorRole: "owner",
      people: factPending(),
      workcenters: factPending(),
      products: factPending(),
      installation: factPending(),
      materials: factPending(),
      external: factPending(),
    });
    expect(pending.statusLabel).toBeNull();
    expect(pending.loading).toBe(true);
    expect(pending.loadFailed).toBe(false);
    expect(pending.lead).toMatch(/Se citesc/i);
    expect(capability(pending, "Montaj la locație").adoptionLabel).toBe("Stare necunoscută");
    expect(capability(pending, "Materiale execuție").current).toBe("Se citește.");
    expect(capability(pending, "Materiale execuție").current).not.toMatch(/Nu blochează/i);
    expect(capability(pending, "Execuție externă").adoptionLabel).not.toMatch(/oprit|dezactivat/i);

    const failed = presentOrganizationOperatingPicture({
      actorRole: "member",
      people: factError(),
      workcenters: factError(),
      products: factError(),
      installation: factError(),
      materials: factError(),
      external: factError(),
    });
    expect(failed.loading).toBe(false);
    expect(failed.loadFailed).toBe(true);
    expect(failed.retryLabel).toBe("Reîncearcă");
    expect(capability(failed, "Execuție externă")).toMatchObject({
      current: "Nu s-a putut citi.",
      adoptionLabel: "Stare necunoscută",
    });
  });

  it("hides write CTAs for members and keeps owner configuration next steps", () => {
    const member = presentOrganizationOperatingPicture({
      ...readyEmptyAtelier,
      actorRole: "member",
    });
    expect(member.whoCanConfigure).toBe(false);
    expect(member.capabilities.filter((card) => card.id !== "access").every((card) => card.next === null)).toBe(true);
    expect(member.roleNote).toMatch(/Doar proprietarul/i);

    const unknown = presentOrganizationOperatingPicture({
      ...readyEmptyAtelier,
      actorRole: "unknown",
    });
    expect(unknown.whoCanConfigure).toBe(false);

    const owner = presentOrganizationOperatingPicture(readyEmptyAtelier);
    expect(owner.whoCanConfigure).toBe(true);
    expect(capability(owner, "Oameni").next).toMatch(/Adaugă persoane/i);
    expect(capability(owner, "Produse oferite").next).toMatch(/oferite pentru lucrări noi/i);
    expect(capability(owner, "Acces în aplicație").next).toBeNull();
  });
});
