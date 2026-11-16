export type GlobalNavItem = {
  id: string;
  label: string;
  href: string;
  purpose: string;
  /** Tablet priority row (768–1151). Overflow items live under “Mai multe”. */
  midWidthPriority: boolean;
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
    summary: "Clienți, cereri și oferte.",
    items: [
      {
        id: "clients",
        label: "Clienți",
        href: "/clienti",
        purpose: "Deschide registrul sau înregistrează un client.",
        midWidthPriority: true,
      },
      {
        id: "requests",
        label: "Cereri",
        href: "/cereri",
        purpose: "Deschide o cerere de ofertă.",
        midWidthPriority: true,
      },
      {
        id: "quotes",
        label: "Oferte",
        href: "/oferte",
        purpose: "Vezi ofertele înghețate.",
        midWidthPriority: false,
      },
    ],
  },
  {
    id: "operations",
    label: "Operațiuni",
    summary: "Lucrări și atelier.",
    items: [
      {
        id: "jobs",
        label: "Lucrări",
        href: "/lucrari",
        purpose: "Continuă lucrările eliberate.",
        midWidthPriority: true,
      },
      {
        id: "atelier",
        label: "Atelier",
        href: "/atelier",
        purpose: "Identifică operatorul și preia sarcina disponibilă.",
        midWidthPriority: true,
      },
    ],
  },
  {
    id: "administration",
    label: "Administrare",
    summary: "Setările organizației.",
    items: [
      {
        id: "catalog",
        label: "Catalog",
        href: "/catalog",
        purpose: "Administrează definițiile și construcția produselor.",
        midWidthPriority: false,
      },
      {
        id: "administration",
        label: "Administrare",
        href: "/admin",
        purpose: "Deschide setările organizației.",
        midWidthPriority: false,
      },
    ],
  },
];

/** V1 Organization Access: the server capability each module needs before it is offered. */
export const NAV_CAPABILITY: Readonly<Record<string, string>> = {
  clients: "customers.read",
  requests: "requests.read",
  quotes: "quotes.read",
  jobs: "jobs.read",
  atelier: "execution.operate",
  catalog: "org.settings.read",
  administration: "org.settings.read",
};

/** `null` capabilities (single-plane runtime, legacy server) keep every module, as before V1. */
export function visibleNavGroups(capabilities: readonly string[] | null): readonly GlobalNavGroup[] {
  if (!capabilities) return GLOBAL_NAV;
  const held = new Set(capabilities);
  return GLOBAL_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !NAV_CAPABILITY[item.id] || held.has(NAV_CAPABILITY[item.id])),
  })).filter((group) => group.items.length > 0);
}

export function globalNavItems(): readonly GlobalNavItem[] {
  return GLOBAL_NAV.flatMap((group) => group.items);
}

export function midWidthPriorityItems(): readonly GlobalNavItem[] {
  return globalNavItems().filter((item) => item.midWidthPriority);
}

export function midWidthOverflowItems(): readonly GlobalNavItem[] {
  return globalNavItems().filter((item) => !item.midWidthPriority);
}
