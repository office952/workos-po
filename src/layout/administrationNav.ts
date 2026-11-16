/**
 * R3 · Administration navigation, variant B (WorkOS-N „13 · Administrare”).
 *
 * One taxonomy, named by goal: five domains, each owning existing destinations. Routes and the
 * owner of every configuration stay as they were; only the grouping and the labels shown to the
 * operator live here. The hub, the domain selector, the tabs and the phone sheet all read this list,
 * so there is no second menu to keep in sync.
 */
export type AdministrationRailId =
  | "catalog"
  | "commercial"
  | "offering"
  | "company"
  | "resources"
  | "services"
  | "materials"
  | "technical"
  | "formulas"
  | "products"
  | "access"
  | "people"
  | "workcenters"
  | "external-production";

export type AdministrationDomainId = "company" | "offer" | "calculation" | "workshop" | "execution" | "access";

export type AdministrationNavItem = {
  id: AdministrationRailId;
  label: string;
  href: string;
  purpose: string;
  /** Catalog is a separate workspace: shown with an outward mark, never as an admin tab. */
  external: boolean;
  selected: boolean;
  current: boolean;
  group: string;
};

export type AdministrationDomain = {
  id: AdministrationDomainId;
  index: string;
  label: string;
  description: string;
  items: AdministrationNavItem[];
};

type DomainDefinition = {
  id: AdministrationDomainId;
  label: string;
  description: string;
  items: readonly {
    id: AdministrationRailId;
    label: string;
    href: string;
    purpose: string;
    external?: boolean;
  }[];
};

const ADMINISTRATION_DOMAINS: readonly DomainDefinition[] = [
  {
    id: "company",
    label: "Firma",
    description: "Identitatea legală, fiscală și bancară de pe documente.",
    items: [
      {
        id: "company",
        label: "Date firmă",
        href: "/admin/company",
        purpose: "Denumire, CIF, registru, adresă și date bancare pentru oferte.",
      },
    ],
  },
  {
    id: "offer",
    label: "Ce oferi",
    description: "Ce poate fi ales pentru lucrările noi.",
    items: [
      {
        id: "products",
        label: "Produse oferite",
        href: "/admin/products",
        purpose: "Alege produsele care apar pentru lucrări noi.",
      },
      {
        id: "services",
        label: "Servicii operaționale",
        href: "/admin/services",
        purpose: "Alege cum este oferit montajul la locație.",
      },
      {
        id: "catalog",
        label: "Catalog",
        href: "/catalog",
        purpose: "Construcția, componentele și regulile produselor. Spațiu de lucru separat.",
        external: true,
      },
    ],
  },
  {
    id: "calculation",
    label: "Cum calculezi",
    description: "Valorile de pornire pentru oferte și costurile interne.",
    items: [
      {
        id: "commercial",
        label: "Valori comerciale",
        href: "/admin/commercial",
        purpose: "Valorile de pornire pentru ofertele noi.",
      },
      {
        id: "offering",
        label: "Reguli de ofertare",
        href: "/admin/offering",
        purpose: "Cine stabilește prețul și când este nevoie de aprobarea ta.",
      },
      {
        id: "resources",
        label: "Costuri de producție",
        href: "/admin/resources",
        purpose: "Costul materialelor, manopera și tarifele operațiilor.",
      },
      {
        id: "technical",
        label: "Setări tehnice",
        href: "/admin/technical",
        purpose: "Valori tehnice pentru lucrări noi.",
      },
      {
        id: "formulas",
        label: "Formule de calcul",
        href: "/admin/formulas",
        purpose: "Formule tehnice pentru lucrări noi.",
      },
    ],
  },
  {
    id: "workshop",
    label: "Echipa și atelierul",
    description: "Cine lucrează și pe ce zone și utilaje.",
    items: [
      {
        id: "people",
        label: "Oameni",
        href: "/admin/people",
        purpose: "Persoanele care pot lucra în producție.",
      },
      {
        id: "workcenters",
        label: "Zone și utilaje",
        href: "/admin/workcenters",
        purpose: "Zonele de lucru și utilajele atelierului.",
      },
    ],
  },
  {
    id: "execution",
    label: "Execuția",
    description: "Ce se confirmă la pornire și ce se predă în afară.",
    items: [
      {
        id: "materials",
        label: "Materiale execuție",
        href: "/admin/material-readiness",
        purpose: "Confirmarea materialelor la pornirea sarcinilor.",
      },
      {
        id: "external-production",
        label: "Execuție externă",
        href: "/admin/external-production",
        purpose: "Predarea sarcinilor către furnizori din afara atelierului.",
      },
    ],
  },
  {
    id: "access",
    label: "Accesul",
    description: "Cine se poate autentifica în organizație.",
    items: [
      {
        id: "access",
        label: "Acces organizație",
        href: "/admin/access",
        purpose: "Utilizatorii care se pot autentifica în organizație.",
      },
    ],
  },
];

export function administrationDomains(current: AdministrationRailId | null = null): AdministrationDomain[] {
  return ADMINISTRATION_DOMAINS.map((domain, index) => ({
    id: domain.id,
    index: String(index + 1).padStart(2, "0"),
    label: domain.label,
    description: domain.description,
    items: domain.items.map((item) => ({
      id: item.id,
      label: item.label,
      href: item.href,
      purpose: item.purpose,
      external: item.external === true,
      selected: item.id === current,
      current: item.id === current,
      group: domain.label,
    })),
  }));
}

/** The domain that owns a destination. */
export function administrationDomainOf(id: AdministrationRailId): AdministrationDomain {
  const domains = administrationDomains(id);
  const found = domains.find((domain) => domain.items.some((item) => item.id === id));
  if (!found) {
    throw new Error(`Unknown administration destination: ${id}`);
  }
  return found;
}

/** Kept for callers that only need the flat list (legacy name). */
export function administrationGroups(current: AdministrationRailId | null = null) {
  return administrationDomains(current);
}

export function administrationRailItems(current: AdministrationRailId): AdministrationNavItem[] {
  return administrationDomains(current).flatMap((domain) => domain.items);
}
