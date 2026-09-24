import { readTransportErrorCode, TransportError } from "../api/http";

export function presentExecutionCompletionError(error: unknown): string {
  if (!(error instanceof TransportError)) {
    return "Finalizarea a eșuat.";
  }
  const code = readTransportErrorCode(error.body);
  switch (code) {
    case "invalid_resource":
      return "Consumul efectiv nu se potrivește cu resursele planificate pentru această sarcină.";
    case "invalid_quantity":
      return "Cantitatea consumată trebuie să fie un număr valid, zero sau pozitiv.";
    case "invalid_unit":
      return "Unitatea de măsură nu este acceptată pentru această resursă.";
    case "invalid_note":
      return "Observația de finalizare nu este acceptată.";
    case "wrong_executor":
      return "Doar operatorul care lucrează sarcina o poate închide.";
    case "invalid_transition":
      return "Sarcina nu poate fi închisă în starea actuală.";
    case "invalid_payload":
      return "Datele de finalizare nu sunt valide.";
    case "machine_run_active":
      return "Oprește rularea utilajului înainte de a închide sarcina.";
    case "invalid_actual_duration":
      return "Timpul efectiv trebuie să fie un număr întreg de minute, zero sau pozitiv.";
    default:
      return "Sarcina nu poate fi închisă încă.";
  }
}