/**
 * N-020 · the short reading of `matchedOn` on a card: the server's labels grouped by what they
 * are (site, year, title, reference, offers, photos, documents), in the order the server gave
 * them. Nothing is added: every group comes from at least one label, and the full list stays one
 * click away ("Detalii potrivire").
 */
export type MatchGroup = { key: string; label: string };

const YEAR = /^Anul (\d{4})$/;

function groupOf(label: string): { key: string; text: string; counted: boolean } {
  const year = YEAR.exec(label);
  if (year) return { key: `an:${year[1]}`, text: `anul ${year[1]}`, counted: false };
  if (label === "Sediu") return { key: "sediu", text: "sediu", counted: false };
  if (label === "Titlu") return { key: "titlu", text: "titlu", counted: false };
  if (label === "Referință") return { key: "referinta", text: "referință", counted: false };
  if (label === "Descriere") return { key: "descriere", text: "descriere", counted: false };
  if (label === "Lucrare") return { key: "lucrare", text: "lucrare", counted: false };
  if (label.startsWith("Ofertă ")) return { key: "oferte", text: "oferte", counted: true };
  // Document labels are "<tip>: <titlu>" (documentSearchFields); photos apart from the other files.
  if (label.startsWith("Fotografie:")) return { key: "fotografii", text: "fotografii", counted: true };
  if (label.includes(": ")) return { key: "documente", text: "documente", counted: true };
  return { key: `alt:${label}`, text: label.toLocaleLowerCase("ro"), counted: false };
}

export function summarizeMatch(matchedOn: readonly string[]): MatchGroup[] {
  const groups = new Map<string, { text: string; counted: boolean; count: number }>();
  for (const label of new Set(matchedOn)) {
    const group = groupOf(label);
    const current = groups.get(group.key);
    if (current) current.count += 1;
    else groups.set(group.key, { text: group.text, counted: group.counted, count: 1 });
  }
  return [...groups].map(([key, group]) => ({ key, label: group.counted && group.count > 1 ? `${group.text} (${group.count})` : group.text }));
}
