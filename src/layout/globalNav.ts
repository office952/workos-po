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

export const PRIMARY_NAV_GAP_PX = 8;

/**
 * Continuation groups for the start page. The shell renders `globalNavItems()`
 * as one primary row and does not show these labels in the header.
 */
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
      },
      {
        id: "requests",
        label: "Cereri",
        href: "/cereri",
        purpose: "Deschide o cerere de ofertă.",
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

export function primaryNavVisibleCount(input: {
  containerWidth: number;
  itemWidths: readonly number[];
  moreWidth: number;
  gap?: number;
}): number {
  const gap = input.gap ?? PRIMARY_NAV_GAP_PX;
  const { containerWidth, itemWidths, moreWidth } = input;
  if (containerWidth <= 0 || itemWidths.length === 0) {
    return itemWidths.length;
  }

  const widthOf = (count: number, includeMore: boolean): number => {
    let width = 0;
    for (let index = 0; index < count; index += 1) {
      width += itemWidths[index] ?? 0;
      if (index > 0) {
        width += gap;
      }
    }
    if (includeMore && count < itemWidths.length) {
      if (count > 0) {
        width += gap;
      }
      width += moreWidth;
    }
    return width;
  };

  if (widthOf(itemWidths.length, false) <= containerWidth) {
    return itemWidths.length;
  }

  for (let count = itemWidths.length - 1; count >= 1; count -= 1) {
    if (widthOf(count, true) <= containerWidth) {
      return count;
    }
  }

  return 1;
}
