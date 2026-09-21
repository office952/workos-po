export type AdministrationRailId = "commercial" | "resources" | "technical" | "formulas";

const ADMINISTRATION_RAIL = [
  { id: "commercial", label: "Valori comerciale", href: "/admin/commercial" },
  { id: "technical", label: "Setări tehnice", href: "/admin/technical" },
  { id: "formulas", label: "Formule de calcul", href: "/admin/formulas" },
  { id: "resources", label: "Dovezi de cost", href: "/admin/resources" },
] as const;

export function administrationRailItems(current: AdministrationRailId) {
  return ADMINISTRATION_RAIL.map((item) => ({
    id: item.id,
    label: item.label,
    selected: item.id === current,
    href: item.id === current ? undefined : item.href,
  }));
}
