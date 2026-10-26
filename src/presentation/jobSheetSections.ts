import type { JobSheetSection } from "../routing/appRoute";

/** The operator-facing name of a job sheet section. */
export function jobSheetSectionLabel(section: JobSheetSection): string {
  switch (section) {
    case "situatie":
      return "Situație";
    case "operatii":
      return "Operații";
    case "fisiere":
      return "Fișiere";
    case "oameni":
      return "Oameni";
    case "istoric":
      return "Istoric";
    case "date":
      return "Date lucrare";
    default: {
      const neverSection: never = section;
      return neverSection;
    }
  }
}
