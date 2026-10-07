export type AdministrationRailId =
  | "catalog"
  | "commercial"
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

export type AdministrationNavItem = {
  id: AdministrationRailId;
  label: string;
  href: string;
  purpose: string;
  selected: boolean;
  current: boolean;
  group: string;
};

type AdministrationGroup = {
  id: string;
  label: string;
  items: readonly {
    id: AdministrationRailId;
    label: string;
    href: string;
    purpose: string;
  }[];
};

const ADMINISTRATION_GROUPS: readonly AdministrationGroup[] = [
  {
    id: "organization",
    label: "Organizație",
    items: [
      { id: "catalog", label: "Catalog", href: "/catalog", purpose: "Administrează construcția, componentele și regulile produselor." },
      {
        id: "products",
        label: "Produse oferite",
        href: "/admin/products",
        purpose: "Alege produsele care apar pentru lucrări noi.",
      },
      {
        id: "access",
        label: "Acces",
        href: "/admin/access",
        purpose: "Gestionează cine se poate autentifica în organizație.",
      },
      {
        id: "people",
        label: "Oameni",
        href: "/admin/people",
        purpose: "Configurează persoanele care pot lucra în producție.",
      },
      {
        id: "workcenters",
        label: "Zone și utilaje",
        href: "/admin/workcenters",
        purpose: "Configurează zonele de lucru și utilajele.",
      },
    ],
  },
  {
    id: "commercial-calculation",
    label: "Comercial și calcul",
    items: [
      {
        id: "commercial",
        label: "Valori comerciale",
        href: "/admin/commercial",
        purpose: "Stabilește valorile de pornire pentru ofertele noi.",
      },
      {
        id: "technical",
        label: "Setări tehnice",
        href: "/admin/technical",
        purpose: "Stabilește valorile tehnice pentru lucrările noi.",
      },
      {
        id: "formulas",
        label: "Formule de calcul",
        href: "/admin/formulas",
        purpose: "Stabilește formulele folosite la lucrările noi.",
      },
      {
        id: "resources",
        label: "Dovezi de cost",
        href: "/admin/resources",
        purpose: "Confirmă tariful pe resursă pentru calcule noi.",
      },
    ],
  },
  {
    id: "execution",
    label: "Execuție",
    items: [
      {
        id: "services",
        label: "Servicii",
        href: "/admin/services",
        purpose: "Alege cum este oferit montajul la locație.",
      },
      {
        id: "materials",
        label: "Materiale execuție",
        href: "/admin/material-readiness",
        purpose: "Alege dacă pornirea cere confirmarea materialelor.",
      },
      {
        id: "external-production",
        label: "Execuție externă",
        href: "/admin/external-production",
        purpose: "Alege dacă o sarcină poate fi predată în afara atelierului.",
      },
    ],
  },
];

export function administrationGroups(current: AdministrationRailId | null = null) {
  return ADMINISTRATION_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.items.map((item) => ({
      id: item.id,
      label: item.label,
      href: item.href,
      purpose: item.purpose,
      selected: item.id === current,
      current: item.id === current,
      group: group.label,
    })),
  }));
}

export function administrationRailItems(current: AdministrationRailId): AdministrationNavItem[] {
  return administrationGroups(current).flatMap((group) => group.items);
}
