export type AdministrationRailId =
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

const ADMINISTRATION_RAIL = [
  { id: "products", label: "Produse oferite", href: "/admin/products" },
  { id: "access", label: "Acces", href: "/admin/access" },
  { id: "people", label: "Oameni", href: "/admin/people" },
  { id: "workcenters", label: "Zone și utilaje", href: "/admin/workcenters" },
  { id: "commercial", label: "Valori comerciale", href: "/admin/commercial" },
  { id: "technical", label: "Setări tehnice", href: "/admin/technical" },
  { id: "formulas", label: "Formule de calcul", href: "/admin/formulas" },
  { id: "resources", label: "Dovezi de cost", href: "/admin/resources" },
  { id: "services", label: "Servicii", href: "/admin/services" },
  { id: "materials", label: "Materiale execuție", href: "/admin/material-readiness" },
  { id: "external-production", label: "Execuție externă", href: "/admin/external-production" },
] as const;

export function administrationRailItems(current: AdministrationRailId) {
  return ADMINISTRATION_RAIL.map((item) => ({
    id: item.id,
    label: item.label,
    selected: item.id === current,
    href: item.id === current ? undefined : item.href,
  }));
}
