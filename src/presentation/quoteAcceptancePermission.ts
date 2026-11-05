export function presentQuoteAcceptancePermission(input: {
  serverAllows: boolean;
  mode: "cloud" | "single_plane";
  role: "owner" | "member" | null;
  roleReady: boolean;
  unavailable: boolean;
}): { allowed: boolean; message: string } {
  if (!input.roleReady || input.unavailable) {
    return { allowed: false, message: "Se verifică dreptul de acceptare." };
  }
  if (!input.serverAllows) {
    return {
      allowed: false,
      message: "Acceptarea nu este disponibilă pentru această ofertă.",
    };
  }
  switch (input.mode) {
    case "single_plane":
      return { allowed: true, message: "Acceptarea este disponibilă în acest plan de lucru." };
    case "cloud":
      switch (input.role) {
        case "owner":
          return { allowed: true, message: "Acceptarea: numai proprietarul. Rolul tău: Proprietar." };
        case "member":
          return { allowed: false, message: "Acceptarea este disponibilă numai proprietarului. Rolul tău: Membru." };
        case null:
          return { allowed: false, message: "Dreptul de acceptare nu a putut fi citit." };
        default: {
          const exhaustiveRole: never = input.role;
          return exhaustiveRole;
        }
      }
    default: {
      const exhaustiveMode: never = input.mode;
      return exhaustiveMode;
    }
  }
}
