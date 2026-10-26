/**
 * N-020 · which section tabs the folded band shows (579:6351; tablet 588:7090 "+ N secțiuni"). The
 * current section is always a tab; the others follow in their order while they fit, and the rest
 * stay one step away in "+ N secțiuni". When even the current tab and that menu do not fit next to
 * the name and "Cerere nouă", the band is `tight`: the name gives up the room (it is shortened, the
 * full name stays in the page header) and no tab is ever pushed under the button or out of view.
 */
export type SectionFit<S extends string> = { visible: S[]; tight: boolean };

export function fitSections<S extends string>({
  order,
  current,
  widths,
  moreWidth,
  available,
}: {
  /** Every section, in the order of the tabs. */
  order: readonly S[];
  current: S;
  /** The width of each tab as it is drawn (the current one in its current style). */
  widths: Readonly<Record<S, number>>;
  /** The width of the "+ N secțiuni" button. */
  moreWidth: number;
  /** The room the tabs have. */
  available: number;
}): SectionFit<S> {
  const others = order.filter((item) => item !== current);
  const known = order.includes(current);
  const chosen = new Set<S>(known ? [current] : []);
  let used = known ? widths[current] : 0;
  for (const [index, item] of others.entries()) {
    // The menu is needed only while some section is left out.
    const last = index === others.length - 1;
    if (used + widths[item] + (last ? 0 : moreWidth) > available) break;
    chosen.add(item);
    used += widths[item];
  }
  const allShown = others.every((item) => chosen.has(item));
  const needed = used + (allShown ? 0 : moreWidth);
  return { visible: order.filter((item) => chosen.has(item)), tight: needed > available };
}
