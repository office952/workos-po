import { useEffect, useState } from "react";
import { setSectionDetail } from "../header/sectionDetail";

export const yearAnchorId = (year: number) => `dhist-an-${year}`;

/**
 * The year whose block is under the fixed layers (WorkOS bar, band, search). Read on scroll, in
 * one animation frame; the folded phone header shows it next to the section (580:4114).
 */
export function useYearInView(customerId: string, years: readonly number[]): number | null {
  const [inView, setInView] = useState<number | null>(years[0] ?? null);
  const key = years.join(",");
  useEffect(() => {
    const list = key ? key.split(",").map(Number) : [];
    if (!list.length) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const page = document.querySelector<HTMLElement>(".chub");
      const top = Number.parseFloat(page?.style.getPropertyValue("--dh-sticky-top") || "0") + 96;
      let current = list[0] ?? null;
      // At the end of the page the last years cannot reach the top: the last one in sight counts.
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      for (const year of list) {
        const node = document.getElementById(yearAnchorId(year));
        if (!node) continue;
        const nodeTop = node.getBoundingClientRect().top;
        if (nodeTop <= top || (atEnd && nodeTop < window.innerHeight - 48)) current = year;
      }
      setInView(current);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(read);
    };
    frame = window.requestAnimationFrame(read);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [key]);
  useEffect(() => {
    setSectionDetail(customerId, inView === null ? null : String(inView));
  }, [customerId, inView]);
  useEffect(() => () => setSectionDetail(customerId, null), [customerId]);
  return years.length ? inView : null;
}

