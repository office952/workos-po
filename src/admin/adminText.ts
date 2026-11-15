/** „N modificări nesalvate” in Romanian plural form. */
export function changeCountLabel(count: number): string {
  if (count === 1) return "1 modificare nesalvată";
  if (count > 1 && count < 20) return `${count} modificări nesalvate`;
  return `${count} de modificări nesalvate`;
}
