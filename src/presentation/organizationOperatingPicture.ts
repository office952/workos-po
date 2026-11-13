import type { PresentationTone } from "./foundationProof";

export type OrganizationOperatingRole = "owner" | "member" | "unknown";

export type FactLoad<T> =
  | { status: "pending" }
  | { status: "error" }
  | { status: "ready"; value: T };

export type OrganizationOperatingFacts = {
  actorRole: OrganizationOperatingRole;
  people: FactLoad<{ count: number; withPinCount: number }>;
  workcenters: FactLoad<{ count: number; machineCount: number }>;
  products: FactLoad<{ enabledCount: number; offeredCount: number }>;
  installation: FactLoad<{
    mode: string | null;
    label: string;
  } | null>;
  materials: FactLoad<{ policy: "REQUIRED" | "DISABLED" }>;
  external: FactLoad<{ policy: "ENABLED" | "DISABLED" }>;
};

export type OrganizationCapabilityKind =
  | "products"
  | "people"
  | "workcenters"
  | "installation"
  | "materials"
  | "external"
  | "access";

export type OrganizationCapabilityCard = {
  id: OrganizationCapabilityKind;
  name: string;
  href: string;
  current: string;
  adoptionLabel: string;
  next: string | null;
};

export type OrganizationNextAction = {
  href: string;
  label: string;
  description: string;
};

export type OrganizationOperatingPicture = {
  actorRole: OrganizationOperatingRole;
  heading: string;
  lead: string;
  statusLabel: string | null;
  statusTone: PresentationTone;
  roleNote: string;
  nextAction: OrganizationNextAction;
  capabilities: OrganizationCapabilityCard[];
  whoCanConfigure: boolean;
  historyNote: string;
  loading: boolean;
  loadFailed: boolean;
  retryLabel: string;
};

export const ORGANIZATION_RETRY_LABEL = "Reîncearcă";

const HISTORY_NOTE =
  "Schimbările de setări se aplică lucrărilor noi. Ofertele înghețate și lucrările existente rămân neschimbate.";

const PEOPLE_HREF = "/admin/people";
const WORKCENTERS_HREF = "/admin/workcenters";
const PRODUCTS_HREF = "/admin/products";
const INSTALLATION_HREF = "/admin/services";
const MATERIALS_HREF = "/admin/material-readiness";
const EXTERNAL_HREF = "/admin/external-production";
const ACCESS_HREF = "/admin/access";
const CLIENTS_HREF = "/clienti";

export function factPending<T = never>(): FactLoad<T> {
  return { status: "pending" };
}

export function factError<T = never>(): FactLoad<T> {
  return { status: "error" };
}

export function factReady<T>(value: T): FactLoad<T> {
  return { status: "ready", value };
}

export function presentOrganizationOperatingPicture(
  facts: OrganizationOperatingFacts,
): OrganizationOperatingPicture {
  const whoCanConfigure = facts.actorRole === "owner";
  const loading = hasStatus(facts, "pending");
  const loadFailed = hasStatus(facts, "error");
  const products = facts.products.status === "ready" ? facts.products.value : null;
  const people = facts.people.status === "ready" ? facts.people.value : null;
  const workcenters = facts.workcenters.status === "ready" ? facts.workcenters.value : null;
  const atelierConfigured = Boolean(
    (people && people.count > 0) || (workcenters && (workcenters.count > 0 || workcenters.machineCount > 0)),
  );

  return {
    actorRole: facts.actorRole,
    heading: "Ce poți folosi acum",
    lead: presentLead({
      actorRole: facts.actorRole,
      products,
      productsLoad: facts.products,
      atelierConfigured,
      peopleReady: people !== null,
      workcentersReady: workcenters !== null,
    }),
    statusLabel: presentStatusLabel(facts.products),
    statusTone: presentStatusTone(facts.products),
    roleNote: whoCanConfigure
      ? "Tu poți schimba oferta și execuția pentru toată organizația."
      : "Poți lucra cu oferta și lucrările existente. Doar proprietarul schimbă oferta, oamenii, utilajele și politicile de execuție.",
    nextAction: presentNextAction(facts.products, whoCanConfigure),
    capabilities: [
      presentProducts(facts.products, whoCanConfigure),
      presentPeople(facts.people, whoCanConfigure),
      presentWorkcenters(facts.workcenters, whoCanConfigure),
      presentInstallation(facts.installation, whoCanConfigure),
      presentMaterials(facts.materials, whoCanConfigure),
      presentExternal(facts.external, whoCanConfigure),
      presentAccess(),
    ],
    whoCanConfigure,
    historyNote: HISTORY_NOTE,
    loading,
    loadFailed,
    retryLabel: ORGANIZATION_RETRY_LABEL,
  };
}

function factList(facts: OrganizationOperatingFacts): FactLoad<unknown>[] {
  return [
    facts.people,
    facts.workcenters,
    facts.products,
    facts.installation,
    facts.materials,
    facts.external,
  ];
}

function hasStatus(facts: OrganizationOperatingFacts, status: "pending" | "error"): boolean {
  return factList(facts).some((fact) => fact.status === status);
}

function presentStatusLabel(products: FactLoad<{ enabledCount: number }>): string | null {
  if (products.status !== "ready") return null;
  return products.value.enabledCount > 0 ? "Comercial disponibil" : "Fără produse oferite";
}

function presentStatusTone(products: FactLoad<{ enabledCount: number }>): PresentationTone {
  if (products.status === "pending") return "pending";
  if (products.status === "error") return "pending";
  return products.value.enabledCount > 0 ? "incomplete" : "blocked";
}

function presentLead(input: {
  actorRole: OrganizationOperatingRole;
  products: { enabledCount: number } | null;
  productsLoad: FactLoad<{ enabledCount: number }>;
  atelierConfigured: boolean;
  peopleReady: boolean;
  workcentersReady: boolean;
}): string {
  if (input.productsLoad.status === "pending") {
    return "Se citesc produsele oferite și setările organizației.";
  }
  if (input.productsLoad.status === "error") {
    return "Produsele oferite nu s-au putut citi. Reîncearcă fără a presupune că oferta lipsește.";
  }
  if (input.products && input.products.enabledCount === 0) {
    return input.actorRole === "owner"
      ? "Niciun produs nu este oferit pentru lucrări noi. Catalogul rămâne consultativ până activezi oferta."
      : "Niciun produs nu este oferit pentru lucrări noi. Doar proprietarul poate schimba oferta.";
  }
  const atelierNote =
    !input.atelierConfigured && input.peopleReady && input.workcentersReady
      ? " Atelierul (oameni, utilaje, execuție) este opțional și nu decide dacă organizația poate lucra comercial."
      : "";
  return `Poți deschide clienți și oferte cu produsele deja oferite.${atelierNote}`;
}

function presentNextAction(
  products: FactLoad<{ enabledCount: number }>,
  whoCanConfigure: boolean,
): OrganizationNextAction {
  if (products.status === "pending") {
    return {
      href: PRODUCTS_HREF,
      label: "Produse oferite",
      description: "Se citește oferta. Așteaptă sau reîncearcă, fără a trata lipsa datelor ca ofertă goală.",
    };
  }
  if (products.status === "error") {
    return {
      href: PRODUCTS_HREF,
      label: "Produse oferite",
      description: "Oferta nu s-a putut citi. Reîncearcă sau deschide pagina de produse.",
    };
  }
  if (products.value.enabledCount === 0) {
    return {
      href: PRODUCTS_HREF,
      label: "Produse oferite",
      description: whoCanConfigure
        ? "Alege ce produse sunt oferite pentru lucrări noi. Catalogul rămâne consultativ."
        : "Niciun produs nu este oferit pentru lucrări noi. Doar proprietarul poate schimba oferta.",
    };
  }
  return {
    href: CLIENTS_HREF,
    label: "Clienți",
    description: whoCanConfigure
      ? "Deschide un client sau o ofertă. Nu depinde de Atelier."
      : "Deschide un client sau o ofertă cu produsele deja oferite.",
  };
}

function unknownCard(
  id: OrganizationCapabilityKind,
  name: string,
  href: string,
  current: string,
  next: string | null,
): OrganizationCapabilityCard {
  return {
    id,
    name,
    href,
    current,
    adoptionLabel: "Stare necunoscută",
    next,
  };
}

function presentPeople(
  load: FactLoad<{ count: number; withPinCount: number }>,
  whoCanConfigure: boolean,
): OrganizationCapabilityCard {
  const next = whoCanConfigure ? "Adaugă persoane și PIN pentru Atelier, dacă execuția e internă." : null;
  if (load.status === "pending") {
    return unknownCard("people", "Oameni", PEOPLE_HREF, "Se citește.", next);
  }
  if (load.status === "error") {
    return unknownCard("people", "Oameni", PEOPLE_HREF, "Nu s-a putut citi.", next);
  }
  const { count, withPinCount } = load.value;
  let current = "Nicio persoană operațională.";
  if (count === 1 && withPinCount === 0) current = "1 persoană, fără PIN pentru Atelier.";
  else if (count > 1 && withPinCount === 0) current = `${count} persoane, fără PIN pentru Atelier.`;
  else if (count === 1 && withPinCount === 1) current = "1 persoană cu PIN.";
  else if (count > 1 && withPinCount === count) current = `${count} persoane cu PIN.`;
  else if (count > 0) current = `${withPinCount} din ${count} cu PIN pentru Atelier.`;
  return {
    id: "people",
    name: "Oameni",
    href: PEOPLE_HREF,
    current,
    adoptionLabel: count === 0 ? "Opțional · necesar pentru Atelier" : "Adoptat pentru Atelier",
    next,
  };
}

function presentWorkcenters(
  load: FactLoad<{ count: number; machineCount: number }>,
  whoCanConfigure: boolean,
): OrganizationCapabilityCard {
  const next = whoCanConfigure ? "Adaugă zone și utilaje dacă execuția e internă." : null;
  if (load.status === "pending") {
    return unknownCard("workcenters", "Zone și utilaje", WORKCENTERS_HREF, "Se citește.", next);
  }
  if (load.status === "error") {
    return unknownCard("workcenters", "Zone și utilaje", WORKCENTERS_HREF, "Nu s-a putut citi.", next);
  }
  const { count, machineCount } = load.value;
  const empty = count === 0 && machineCount === 0;
  return {
    id: "workcenters",
    name: "Zone și utilaje",
    href: WORKCENTERS_HREF,
    current: empty
      ? "Nicio zonă și niciun utilaj."
      : `${countLabel(count, "zonă", "zone")} · ${countLabel(machineCount, "utilaj", "utilaje")}.`,
    adoptionLabel: empty ? "Opțional · necesar pentru Atelier" : "Adoptat pentru Atelier",
    next,
  };
}

function presentProducts(
  load: FactLoad<{ enabledCount: number; offeredCount: number }>,
  whoCanConfigure: boolean,
): OrganizationCapabilityCard {
  const next = whoCanConfigure ? "Alege ce produse sunt oferite pentru lucrări noi." : null;
  if (load.status === "pending") {
    return unknownCard("products", "Produse oferite", PRODUCTS_HREF, "Se citește.", next);
  }
  if (load.status === "error") {
    return unknownCard("products", "Produse oferite", PRODUCTS_HREF, "Nu s-a putut citi.", next);
  }
  const { enabledCount, offeredCount } = load.value;
  let current = "Niciun produs pentru lucrări noi.";
  if (enabledCount > 0 && offeredCount !== enabledCount) {
    current = `${enabledCount} din ${offeredCount} pentru lucrări noi.`;
  } else if (enabledCount === 1) {
    current = "1 produs pentru lucrări noi.";
  } else if (enabledCount > 1) {
    current = `${enabledCount} produse pentru lucrări noi.`;
  }
  return {
    id: "products",
    name: "Produse oferite",
    href: PRODUCTS_HREF,
    current,
    adoptionLabel: enabledCount === 0 ? "Neadoptat · blochează lucrări noi" : "Adoptat pentru lucrări noi",
    next,
  };
}

function presentInstallation(
  load: FactLoad<{ mode: string | null; label: string } | null>,
  whoCanConfigure: boolean,
): OrganizationCapabilityCard {
  const next = whoCanConfigure ? "Setează oferta de montaj la locație." : null;
  if (load.status === "pending") {
    return unknownCard("installation", "Montaj la locație", INSTALLATION_HREF, "Se citește.", next);
  }
  if (load.status === "error") {
    return unknownCard("installation", "Montaj la locație", INSTALLATION_HREF, "Nu s-a putut citi.", next);
  }
  const service = load.value;
  if (!service) {
    return {
      id: "installation",
      name: "Montaj la locație",
      href: INSTALLATION_HREF,
      current: "Serviciul nu este în catalogul operațional.",
      adoptionLabel: "Nu este în catalog",
      next,
    };
  }
  if (service.mode === "SERVICE_DISABLED") {
    return {
      id: "installation",
      name: "Montaj la locație",
      href: INSTALLATION_HREF,
      current: service.label,
      adoptionLabel: "Dezactivat explicit",
      next,
    };
  }
  if (service.mode === null) {
    return {
      id: "installation",
      name: "Montaj la locație",
      href: INSTALLATION_HREF,
      current: "Neconfigurat.",
      adoptionLabel: "Nu este setat",
      next,
    };
  }
  return {
    id: "installation",
    name: "Montaj la locație",
    href: INSTALLATION_HREF,
    current: service.label,
    adoptionLabel: "Adoptat pentru lucrări noi",
    next,
  };
}

function presentMaterials(
  load: FactLoad<{ policy: "REQUIRED" | "DISABLED" }>,
  whoCanConfigure: boolean,
): OrganizationCapabilityCard {
  const next = whoCanConfigure ? "Alege dacă pornirea cere materialele confirmate." : null;
  if (load.status === "pending") {
    return unknownCard("materials", "Materiale execuție", MATERIALS_HREF, "Se citește.", next);
  }
  if (load.status === "error") {
    return unknownCard("materials", "Materiale execuție", MATERIALS_HREF, "Nu s-a putut citi.", next);
  }
  if (load.value.policy === "DISABLED") {
    return {
      id: "materials",
      name: "Materiale execuție",
      href: MATERIALS_HREF,
      current: "Oprit explicit. Nu blochează pornirea.",
      adoptionLabel: "Dezactivat explicit",
      next,
    };
  }
  return {
    id: "materials",
    name: "Materiale execuție",
    href: MATERIALS_HREF,
    current: "Pornirea cere confirmarea materialelor.",
    adoptionLabel: "Adoptat pentru pornire",
    next,
  };
}

function presentExternal(
  load: FactLoad<{ policy: "ENABLED" | "DISABLED" }>,
  whoCanConfigure: boolean,
): OrganizationCapabilityCard {
  const next = whoCanConfigure ? "Alege dacă o sarcină poate fi predată în afara atelierului." : null;
  if (load.status === "pending") {
    return unknownCard("external", "Execuție externă", EXTERNAL_HREF, "Se citește.", next);
  }
  if (load.status === "error") {
    return unknownCard("external", "Execuție externă", EXTERNAL_HREF, "Nu s-a putut citi.", next);
  }
  if (load.value.policy === "DISABLED") {
    return {
      id: "external",
      name: "Execuție externă",
      href: EXTERNAL_HREF,
      current: "Oprit explicit. Nu blochează pornirea.",
      adoptionLabel: "Dezactivat explicit",
      next,
    };
  }
  return {
    id: "external",
    name: "Execuție externă",
    href: EXTERNAL_HREF,
    current: "Adoptat pentru lucrări noi.",
    adoptionLabel: "Adoptat pentru lucrări noi",
    next,
  };
}

function presentAccess(): OrganizationCapabilityCard {
  return {
    id: "access",
    name: "Acces în aplicație",
    href: ACCESS_HREF,
    current: "Poți vedea cine se autentifică. Conturile noi se adaugă prin administrarea controlată WorkOS.",
    adoptionLabel: "Nu se adaugă din această pagină",
    next: null,
  };
}

function countLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}
