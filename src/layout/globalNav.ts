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
/** Designed wrap capacity inside the fixed header. Outer height does not follow row count. */
export const PRIMARY_NAV_MAX_ROWS = 2;

/**
 * Continuation groups for the start page. The shell renders `globalNavItems()`
 * as one primary nav and does not show these labels in the header.
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

function primaryNavFitsInRows(input: {
  containerWidth: number;
  widths: readonly number[];
  gap: number;
  maxRows: number;
}): boolean {
  const { containerWidth, widths, gap, maxRows } = input;
  if (widths.length === 0) {
    return true;
  }
  let row = 0;
  let used = 0;
  for (const width of widths) {
    if (width > containerWidth) {
      return false;
    }
    if (used === 0) {
      used = width;
      continue;
    }
    if (used + gap + width <= containerWidth) {
      used += gap + width;
      continue;
    }
    row += 1;
    if (row >= maxRows) {
      return false;
    }
    used = width;
  }
  return true;
}

export function primaryNavVisibleCount(input: {
  containerWidth: number;
  itemWidths: readonly number[];
  moreWidth: number;
  gap?: number;
  maxRows?: number;
}): number {
  const gap = input.gap ?? PRIMARY_NAV_GAP_PX;
  const maxRows = input.maxRows ?? PRIMARY_NAV_MAX_ROWS;
  const { containerWidth, itemWidths, moreWidth } = input;
  if (containerWidth <= 0 || itemWidths.length === 0) {
    return itemWidths.length;
  }

  const fits = (count: number, includeMore: boolean): boolean => {
    const widths = itemWidths.slice(0, count);
    if (includeMore && count < itemWidths.length) {
      widths.push(moreWidth);
    }
    return primaryNavFitsInRows({ containerWidth, widths, gap, maxRows });
  };

  if (fits(itemWidths.length, false)) {
    return itemWidths.length;
  }

  for (let count = itemWidths.length - 1; count >= 1; count -= 1) {
    if (fits(count, true)) {
      return count;
    }
  }

  return 1;
}
