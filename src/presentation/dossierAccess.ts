export function observationAccessExplanation(): string {
  return "Observațiile și problemele cer un operator identificat în Atelier. Contul de proprietar nu ține locul identificării.";
}

export function instructionAccessExplanation(): string {
  return "Instrucțiunile le publică proprietarul organizației. Serverul verifică același drept.";
}

export function fileAccessExplanation(canWrite: boolean): string {
  if (canWrite) {
    return "Poți adăuga sau asocia fișiere pentru această operație.";
  }
  return "Fișierele acestei operații cer un operator identificat sau proprietarul organizației.";
}
