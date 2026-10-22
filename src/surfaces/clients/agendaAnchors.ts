import { OTHER_LETTER } from "./clientsAgendaModel";

export function letterAnchor(letter: string): string {
  return `clienti-litera-${letter === OTHER_LETTER ? "altele" : letter}`;
}

/** Scroll to a letter group and put focus on its first client. */
export function jumpToLetter(letter: string): void {
  const heading = document.getElementById(letterAnchor(letter));
  if (!heading) return;
  heading.scrollIntoView({ block: "start", behavior: "smooth" });
  const group = heading.closest("tbody, section");
  group?.querySelector<HTMLElement>("[data-row-id]")?.focus({ preventScroll: true });
}
