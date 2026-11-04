export function presentQuoteAcceptancePermission(input: {
  serverAllows: boolean;
  role: "owner" | "member" | null;
  roleReady: boolean;
}): { allowed: boolean; message: string } {
  if (!input.roleReady) {
    return { allowed: false, message: "Se verifică dreptul de acceptare." };
  }
  if (!input.serverAllows) {
    return {
      allowed: false,
      message: "Acceptarea nu este disponibilă pentru această ofertă.",
    };
  }
  switch (input.role) {
    case "owner":
      return { allowed: true, message: "Acceptarea: numai proprietarul. Rolul tău: Proprietar." };
    case "member":
      return { allowed: false, message: "Acceptarea este disponibilă numai proprietarului. Rolul tău: Membru." };
    case null:
      return { allowed: false, message: "Dreptul de acceptare nu a putut fi citit." };
    default: {
      const exhaustive: never = input.role;
      return exhaustive;
    }
  }
}
