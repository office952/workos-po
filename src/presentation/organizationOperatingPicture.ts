import type { PresentationTone } from "./foundationProof";

export type OrganizationOperatingFacts = {
  peopleCount: number | null;
  peopleWithPinCount: number | null;
  workcenterCount: number | null;
  machineCount: number | null;
  enabledProductCount: number | null;
  offeredProductCount: number | null;
  siteInstallationMode: string | null;
  siteInstallationModeLabel: string | null;
  materialReadinessMode: string | null;
  materialReadinessModeLabel: string | null;
  externalProductionMode: string | null;
  externalProductionModeLabel: string | null;
};

export type OrganizationOperatingRole = "owner" | "member" | "unknown";

export type OrganizationCapabilityKind =
  | "products"
  | "people"
  | "workcenters"
  | "installation"
  | "materials"
  | "external"
  | "access";

export type OrganizationCapabilityAdoption = "optional" | "needed_for_quotes" | "needed_for_atelier";

export type OrganizationCapabilityCard = {
  id: OrganizationCapabilityKind;
  name: string;
  current: string;
  adoptionLabel: string;
  adoption: OrganizationCapabilityAdoption;
  href: string;
  whoCanConfigure: string;
  disabledBehavior: string;
};

export type OrganizationOperatingNextAction = {
  href: string;
  label: string;
  description: string;
};

export type OrganizationOperatingPicture = {
  statusLabel: string;
  statusTone: PresentationTone;
  lead: string;
  historyNote: string;
  roleNote: string;
  emptyOrganization: boolean;
  nextAction: OrganizationOperatingNextAction;
  capabilities: readonly OrganizationCapabilityCard[];
};

const HISTORY_NOTE =
  "Schimbările de setări se aplică lucrărilor noi. Ofertele înghețate și lucrările existente rămân neschimbate.";

const OWNER_CONFIGURES = "Proprietarul organizației";
const MEMBER_CANNOT_CONFIGURE = "Membrul vede setările; doar proprietarul le schimbă.";

export function presentOrganizationOperatingPicture(input: {
  facts: OrganizationOperatingFacts;
  role: OrganizationOperatingRole;
  organizationName: string | null;
}): OrganizationOperatingPicture {
  const emptyOrganization = isEmptyOrganization(input.facts);
  const whoCanConfigure = input.role === "member" ? MEMBER_CANNOT_CONFIGURE : OWNER_CONFIGURES;
  const capabilities = presentCapabilities(input.facts, whoCanConfigure);
  return {
    statusLabel: presentStatusLabel(input.facts, emptyOrganization),
    statusTone: emptyOrganization || !hasKnownOperationalCounts(input.facts) ? "pending" : "incomplete",
    lead: presentLead(emptyOrganization, input.organizationName),
    historyNote: HISTORY_NOTE,
    roleNote:
      input.role === "member"
        ? "Modificările sunt rezervate proprietarului organizației."
        : "Poți modifica setările pentru lucrările noi.",
    emptyOrganization,
    nextAction: presentNextAction(input.facts, emptyOrganization),
    capabilities,
  };
}

function hasKnownOperationalCounts(facts: OrganizationOperatingFacts): boolean {
  return facts.peopleCount !== null && facts.workcenterCount !== null;
}

function isEmptyOrganization(facts: OrganizationOperatingFacts): boolean {
  return facts.peopleCount === 0 && facts.workcenterCount === 0;
}

function presentStatusLabel(facts: OrganizationOperatingFacts, emptyOrganization: boolean): string {
  if (emptyOrganization) {
    return "Organizație nouă";
  }
  if (!hasKnownOperationalCounts(facts)) {
    return "Cont conectat";
  }
  return "Configurare progresivă";
}

function presentLead(emptyOrganization: boolean, organizationName: string | null): string {
  if (emptyOrganization) {
    return organizationName
      ? `${organizationName} poate lucra comercial fără oameni, PIN sau utilaje. Atelierul rămâne opțional.`
      : "Organizația poate lucra comercial fără oameni, PIN sau utilaje. Atelierul rămâne opțional.";
  }
  return "Capabilitățile opționale nu blochează clienții și ofertele. Atelierul este necesar doar pentru producția internă.";
}

function presentNextAction(
  facts: OrganizationOperatingFacts,
  emptyOrganization: boolean,
): OrganizationOperatingNextAction {
  if (facts.enabledProductCount === 0) {
    return {
      href: "/admin/products",
      label: "Produse oferite",
      description: "Alege cel puțin un produs pentru lucrările noi. Cererile pot rămâne momentan indecise.",
    };
  }
  if (emptyOrganization) {
    return {
      href: "/clienti",
      label: "Clienți",
      description: "Înregistrează primul client. Nu este nevoie să configurezi Atelierul ca să ofertezi.",
    };
  }
  return {
    href: "/clienti",
    label: "Clienți",
    description: "Continuă din registrul de clienți sau dintr-o cerere existentă.",
  };
}

function presentCapabilities(
  facts: OrganizationOperatingFacts,
  whoCanConfigure: string,
): OrganizationCapabilityCard[] {
  return [
    presentProducts(facts, whoCanConfigure),
    presentPeople(facts, whoCanConfigure),
    presentWorkcenters(facts, whoCanConfigure),
    presentInstallation(facts, whoCanConfigure),
    presentMaterials(facts, whoCanConfigure),
    presentExternal(facts, whoCanConfigure),
    presentAccess(whoCanConfigure),
  ];
}

function presentProducts(
  facts: OrganizationOperatingFacts,
  whoCanConfigure: string,
): OrganizationCapabilityCard {
  const enabled = facts.enabledProductCount;
  const offered = facts.offeredProductCount;
  const noneEnabled = enabled === 0;
  return {
    id: "products",
    name: "Produse oferite",
    current: enabled === null
      ? "Se citește."
      : noneEnabled
        ? "Niciun produs pentru lucrări noi."
        : offered !== null && offered !== enabled
          ? `${enabled} din ${offered} pentru lucrări noi.`
          : enabled === 1
            ? "1 produs pentru lucrări noi."
            : `${enabled} produse pentru lucrări noi.`,
    adoption: noneEnabled ? "needed_for_quotes" : "optional",
    adoptionLabel: noneEnabled ? "Necesar pentru configurarea unui produs" : "Disponibil pentru lucrări noi",
    href: "/admin/products",
    whoCanConfigure,
    disabledBehavior: "O cerere poate rămâne momentan indecisă. Un produs dezactivat nu apare la lucrări noi; ofertele vechi rămân.",
  };
}

function presentPeople(
  facts: OrganizationOperatingFacts,
  whoCanConfigure: string,
): OrganizationCapabilityCard {
  const count = facts.peopleCount;
  const withPin = facts.peopleWithPinCount;
  let current = "Se citește.";
  if (count === 0) {
    current = "Nicio persoană operațională.";
  } else if (count !== null && withPin !== null) {
    current = withPin === 0
      ? count === 1
        ? "1 persoană, fără PIN pentru Atelier."
        : `${count} persoane, fără PIN pentru Atelier.`
      : withPin === count
        ? count === 1
          ? "1 persoană cu PIN."
          : `${count} persoane cu PIN.`
        : `${withPin} din ${count} cu PIN pentru Atelier.`;
  } else if (count !== null) {
    current = count === 1 ? "1 persoană operațională." : `${count} persoane operaționale.`;
  }
  return {
    id: "people",
    name: "Oameni",
    current,
    adoption: "needed_for_atelier",
    adoptionLabel: "Opțional · necesar pentru Atelier",
    href: "/admin/people",
    whoCanConfigure,
    disabledBehavior: "Fără oameni și PIN, Atelierul nu identifică operatorul. Clienții și ofertele rămân disponibile.",
  };
}

function presentWorkcenters(
  facts: OrganizationOperatingFacts,
  whoCanConfigure: string,
): OrganizationCapabilityCard {
  const workcenters = facts.workcenterCount;
  const machines = facts.machineCount;
  let current = "Se citește.";
  if (workcenters === 0) {
    current = "Nicio zonă și niciun utilaj.";
  } else if (workcenters !== null && machines !== null) {
    current = `${countLabel(workcenters, "zonă", "zone")} · ${countLabel(machines, "utilaj", "utilaje")}.`;
  } else if (workcenters !== null) {
    current = countLabel(workcenters, "zonă", "zone") + ".";
  }
  return {
    id: "workcenters",
    name: "Zone și utilaje",
    current,
    adoption: "needed_for_atelier",
    adoptionLabel: "Opțional · doar dacă producția cere furnizor",
    href: "/admin/workcenters",
    whoCanConfigure,
    disabledBehavior: "O firmă manuală poate oferi fără parc de mașini. Operațiile care cer un utilaj așteaptă un furnizor eligibil.",
  };
}

function presentInstallation(
  facts: OrganizationOperatingFacts,
  whoCanConfigure: string,
): OrganizationCapabilityCard {
  const disabled = facts.siteInstallationMode === "SERVICE_DISABLED" || facts.siteInstallationMode === null;
  return {
    id: "installation",
    name: "Montaj la locație",
    current: facts.siteInstallationModeLabel ?? (facts.siteInstallationMode === null ? "Neconfigurat." : "Se citește."),
    adoption: "optional",
    adoptionLabel: disabled ? "Opțional · dezactivat" : "Adoptat pentru lucrări noi",
    href: "/admin/services",
    whoCanConfigure,
    disabledBehavior: "Dacă este dezactivat, cererea nu oferă montaj. Nu confirmă livrarea și nu închide producția.",
  };
}

function presentMaterials(
  facts: OrganizationOperatingFacts,
  whoCanConfigure: string,
): OrganizationCapabilityCard {
  const required = facts.materialReadinessMode === "REQUIRED";
  return {
    id: "materials",
    name: "Materiale execuție",
    current: facts.materialReadinessModeLabel ?? "Se citește.",
    adoption: "optional",
    adoptionLabel: required ? "Pornirea cere confirmarea materialelor" : "Opțional · nu blochează pornirea",
    href: "/admin/material-readiness",
    whoCanConfigure,
    disabledBehavior: "Oprit, pornirea nu cere confirmarea materialelor. Soldul de stoc nu este disponibilitate de producție.",
  };
}

function presentExternal(
  facts: OrganizationOperatingFacts,
  whoCanConfigure: string,
): OrganizationCapabilityCard {
  const enabled = facts.externalProductionMode === "ENABLED";
  return {
    id: "external",
    name: "Execuție externă",
    current: facts.externalProductionModeLabel ?? "Se citește.",
    adoption: "optional",
    adoptionLabel: enabled ? "Adoptat pentru lucrări noi" : "Opțional · oprit",
    href: "/admin/external-production",
    whoCanConfigure,
    disabledBehavior: "Oprit, sarcinile rămân în atelier. Activarea nu creează automat un furnizor.",
  };
}

function presentAccess(whoCanConfigure: string): OrganizationCapabilityCard {
  return {
    id: "access",
    name: "Acces în aplicație",
    current: "Poți vedea cine se autentifică. Conturile noi se adaugă prin administrarea controlată WorkOS.",
    adoption: "optional",
    adoptionLabel: "Nu se adaugă din această pagină",
    href: "/admin/access",
    whoCanConfigure,
    disabledBehavior: "Browserul nu creează identități Cloud. Poți revoca un acces existent dacă ești proprietar.",
  };
}

function countLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}
