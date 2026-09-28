export type GlobalNavItem = {
  id: string;
  label: string;
  href: string;
  purpose: string;
};

export type GlobalNavGroup = {
  id: "commercial" | "operations" | "administration";
  label: string;
  summary: string;
  items: readonly GlobalNavItem[];
};

export const HOME_HREF = "/";

export const GLOBAL_NAV: readonly GlobalNavGroup[] = [
  {
    id: "commercial",
    label: "Comercial",
    summary: "Clienți, cereri, catalog și oferte.",
    items: [
      {
        id: "clients",
        label: "Clienți",
        href: "/clienti",
        purpose: "Deschide registrul sau înregistrează un client.",
      },
      {
        id: "requests",
        label: "Cereri",
        href: "/cereri",
        purpose: "Deschide o cerere de ofertă.",
      },
      {
        id: "catalog",
        label: "Catalog",
        href: "/catalog",
        purpose: "Alege produsul pentru lucrare.",
      },
      {
        id: "quotes",
        label: "Oferte",
        href: "/oferte",
        purpose: "Vezi ofertele înghețate.",
      },
    ],
  },
  {
    id: "operations",
    label: "Operațiuni",
    summary: "Lucrări, planificare și atelier.",
    items: [
      {
        id: "jobs",
        label: "Lucrări",
        href: "/lucrari",
        purpose: "Continuă lucrările eliberate.",
      },
      {
        id: "planning",
        label: "Planificare",
        href: "/planificare",
        purpose: "Vezi efortul planificat pe zone și utilaje.",
      },
      {
        id: "atelier",
        label: "Atelier",
        href: "/atelier",
        purpose: "Identifică operatorul și preia sarcina disponibilă.",
      },
    ],
  },
  {
    id: "administration",
    label: "Administrare",
    summary: "Setările organizației.",
    items: [
      {
        id: "administration",
        label: "Administrare",
        href: "/admin",
        purpose: "Deschide setările organizației.",
      },
    ],
  },
];

export function globalNavItems(): readonly GlobalNavItem[] {
  return GLOBAL_NAV.flatMap((group) => group.items);
}
