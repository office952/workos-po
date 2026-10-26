import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { CLIENT_HUB_PRIMARY_SECTIONS, CLIENT_HUB_SECTION_HINT, CLIENT_HUB_SECTION_LABEL } from "../../../../presentation/clientHub";
import { clientHref, type ClientHubSection } from "../../../../routing/appRoute";
import { replaceSection, useDisclosure, type BandMode } from "../bandModel";
import { DossierIcon, type DossierIconName } from "../dossierIcons";
import { clientSectionHref } from "../listContext";
import { fitSections, type SectionFit } from "./fitSections";

export type SectionCounts = Partial<Record<ClientHubSection, string | null>>;

/** R1 (846:32109): a section the server says needs attention gets a dot; the words say why. */
export type SectionAttention = Partial<Record<ClientHubSection, string | null>>;

const SECTION_ICON: Partial<Record<ClientHubSection, DossierIconName>> = {
  istoric: "history",
  cereri: "request",
  lucrari: "wrench",
  documente: "file",
  fotografii: "photo",
  sedii: "site",
  comercial: "document",
};

/** The tab content: icon, short label and the attention dot (the counts live in each view). */
function TabLabel({ section, attention }: { section: ClientHubSection; attention?: string | null }) {
  const icon = SECTION_ICON[section];
  return (
    <>
      {icon ? <DossierIcon name={icon} size={15} /> : null}
      <span className="cdh-tab__label">{CLIENT_HUB_SECTION_LABEL[section]}</span>
      {attention ? (
        <>
          <span className="cdh-tab__dot" aria-hidden="true" />{" "}
          <span className="u-visually-hidden">{`· ${attention}`}</span>
        </>
      ) : null}
    </>
  );
}

type PrimarySection = (typeof CLIENT_HUB_PRIMARY_SECTIONS)[number];

function sectionHref(customerId: string, section: PrimarySection): string {
  // A list section reopens with this client's whole remembered context (search, mode, filters, page).
  if (section === "istoric" || section === "cereri" || section === "lucrari" || section === "fotografii" || section === "documente") return clientSectionHref(customerId, section);
  return clientHref(customerId, section);
}

/** On a tablet the current section is always visible: the first sections, the current one last. */
function tabletVisible(current: ClientHubSection): PrimarySection[] {
  const first = CLIENT_HUB_PRIMARY_SECTIONS.slice(0, 3) as PrimarySection[];
  if (first.includes(current as PrimarySection) || !(CLIENT_HUB_PRIMARY_SECTIONS as readonly string[]).includes(current)) return first;
  return [...first.slice(0, 2), current as PrimarySection];
}

/**
 * Navigation between the sections of the client (Figma 574:2203 tabs; tablet 588:7090 with
 * "+ N secțiuni"; phone 649:14364 with "Secțiunea · Schimbă" and the sheet 588:8844). Each section
 * replaces the history entry (Back leaves the page) and list sections reopen with this client's
 * last search and filters. R1: short labels with icons; the counts live in each view, and a dot
 * marks only what the server says needs attention.
 */
export function ClientSectionNav({
  customerId,
  clientName,
  section,
  attention,
  hints,
  mode,
  compact,
  compactDetail,
  back,
}: {
  customerId: string;
  clientName: string;
  section: ClientHubSection;
  attention: SectionAttention;
  hints: SectionCounts;
  mode: BandMode;
  compact: boolean;
  /** Phone, folded: what is in view next to the section ("2021"). */
  compactDetail: string | null;
  back: { href: string; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void };
}) {
  if (mode === "phone") {
    return <PhoneSections customerId={customerId} clientName={clientName} section={section} attention={attention} hints={hints} compact={compact} compactDetail={compactDetail} back={back} />;
  }
  return <SectionTabs customerId={customerId} section={section} attention={attention} mode={mode} compact={compact} />;
}

const ALL_SECTIONS = CLIENT_HUB_PRIMARY_SECTIONS as readonly PrimarySection[];

/**
 * The tabs. Unfolded they follow the frames (desktop all, tablet the first three and the current
 * one). Folded (579:6351), the line also holds the name and "Cerere nouă": the tabs shown are the
 * ones that fit there (fitSections), measured from a hidden copy of every tab, so none is drawn
 * under the button or pushed out of view; the others are in "+ N secțiuni".
 */
function SectionTabs({ customerId, section, attention, mode, compact }: { customerId: string; section: ClientHubSection; attention: SectionAttention; mode: BandMode; compact: boolean }) {
  const navRef = useRef<HTMLElement>(null);
  const probeRef = useRef<HTMLUListElement>(null);
  const [fit, setFit] = useState<SectionFit<PrimarySection> | null>(null);
  const current = section as PrimarySection;
  const attentionKey = JSON.stringify(attention);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const probe = probeRef.current;
    const band = nav?.parentElement ?? null;
    if (!compact || !nav || !probe || !band) {
      setFit(null);
      return;
    }
    const measure = () => {
      const widthOf = (name: string) => probe.querySelector<HTMLElement>(`[data-measure="${name}"]`)?.getBoundingClientRect().width ?? 0;
      const widths = Object.fromEntries(ALL_SECTIONS.map((item) => [item, widthOf(item === current ? "current" : item)])) as Record<PrimarySection, number>;
      const style = getComputedStyle(band);
      const gap = Number.parseFloat(style.columnGap) || 0;
      const inner = band.clientWidth - (Number.parseFloat(style.paddingLeft) || 0) - (Number.parseFloat(style.paddingRight) || 0);
      const others = [...band.children].filter((child) => child !== nav) as HTMLElement[];
      const id = others.find((child) => child.classList.contains("cdh-band__id")) ?? null;
      const name = id?.querySelector<HTMLElement>(".cdh-band__name") ?? null;
      // The name at its own width (it is capped at 260 px by the band's stylesheet).
      const idWidth = id && name ? Math.min(260, id.getBoundingClientRect().width - name.clientWidth + name.scrollWidth) : 0;
      const rest = others.filter((child) => child !== id).reduce((sum, child) => sum + child.getBoundingClientRect().width, 0);
      const room = inner - rest - gap * others.length;
      const next = fitSections({ order: ALL_SECTIONS, current, widths, moreWidth: widthOf("more"), available: room - idWidth });
      if (next.tight) {
        const used = next.visible.reduce((sum, item) => sum + widths[item], 0) + widthOf("more");
        band.style.setProperty("--cdh-band-id-max", `${Math.max(0, Math.floor(room - used))}px`);
      } else {
        band.style.removeProperty("--cdh-band-id-max");
      }
      band.toggleAttribute("data-tight", next.tight);
      setFit((previous) => (previous && previous.tight === next.tight && previous.visible.join() === next.visible.join() ? previous : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(band);
    observer.observe(probe);
    return () => {
      observer.disconnect();
      band.removeAttribute("data-tight");
      band.style.removeProperty("--cdh-band-id-max");
    };
  }, [compact, mode, current, attentionKey]);

  const visible = compact && fit ? fit.visible : mode === "tablet" ? tabletVisible(section) : ALL_SECTIONS;
  const rest = ALL_SECTIONS.filter((item) => !visible.includes(item));
  return (
    <nav ref={navRef} className="cdh-tabs" aria-label="Secțiuni client" data-section-top>
      {compact ? (
        // The widths the folded line is fitted with: every tab as drawn, never focusable or read.
        <ul ref={probeRef} className="cdh-tabs__measure" aria-hidden="true">
          {ALL_SECTIONS.map((item) => (
            <li key={item}>
              <span className="cdh-tab" data-measure={item}>
                <TabLabel section={item} attention={attention[item]} />
              </span>
            </li>
          ))}
          <li>
            <span className="cdh-tab" data-measure="current" data-current>
              <TabLabel section={section} attention={attention[section]} />
            </span>
          </li>
          <li>
            <span className="cdh-tabs__more-button" data-measure="more">
              {`+ ${ALL_SECTIONS.length - 1} secțiuni`}
              <DossierIcon name="chevronDown" size={12} />
            </span>
          </li>
        </ul>
      ) : null}
      <ul className="cdh-tabs__list">
        {visible.map((item) => {
          const href = sectionHref(customerId, item);
          return (
            <li key={item}>
              <a className="cdh-tab" href={href} aria-current={item === section ? "page" : undefined} onClick={(event) => replaceSection(event, href)}>
                <TabLabel section={item} attention={attention[item]} />
              </a>
            </li>
          );
        })}
        {rest.length ? (
          <li>
            <MoreSections customerId={customerId} sections={rest} attention={attention} />
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

function MoreSections({ customerId, sections, attention }: { customerId: string; sections: readonly PrimarySection[]; attention: SectionAttention }) {
  const { open, setOpen, rootRef, buttonRef, onKeyDown } = useDisclosure();
  const id = useId();
  useEffect(() => {
    if (open) rootRef.current?.querySelector<HTMLElement>(".cdh-menu__item")?.focus({ preventScroll: true });
  }, [open, rootRef]);
  return (
    <div className="cdh-tabs__more" ref={rootRef} onKeyDown={onKeyDown}>
      <button type="button" ref={buttonRef} className="cdh-tabs__more-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
        {sections.length === 1 ? "+ 1 secțiune" : `+ ${sections.length} secțiuni`}
        <DossierIcon name={open ? "chevronUp" : "chevronDown"} size={12} />
      </button>
      {open ? (
        <ul id={id} className="cdh-menu" aria-label="Alte secțiuni">
          {sections.map((item) => {
            const href = sectionHref(customerId, item);
            return (
              <li key={item}>
                <a className="cdh-menu__item" href={href} onClick={(event) => { setOpen(false); replaceSection(event, href); }}>
                  <span>{CLIENT_HUB_SECTION_LABEL[item]}</span>
                  {attention[item] ? <span className="cdh-menu__attention">{attention[item]}</span> : null}
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function PhoneSections({
  customerId,
  clientName,
  section,
  attention,
  hints,
  compact,
  compactDetail,
  back,
}: {
  customerId: string;
  clientName: string;
  section: ClientHubSection;
  attention: SectionAttention;
  hints: SectionCounts;
  compact: boolean;
  compactDetail: string | null;
  back: { href: string; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void };
}) {
  const [open, setOpen] = useState(false);
  const label = CLIENT_HUB_SECTION_LABEL[section];
  return (
    <nav className="cdh-phonenav" aria-label="Secțiuni client" data-compact={compact || undefined} data-section-top>
      {compact ? (
        <a className="cdh-phonenav__back" href={back.href} onClick={back.onClick} aria-label="Toți clienții">
          <span aria-hidden="true">←</span>
        </a>
      ) : null}
      <p className="cdh-phonenav__current">
        {compact ? <span className="cdh-phonenav__client">{clientName}</span> : <span className="cdh-phonenav__kicker">Secțiunea</span>}
        <span className="cdh-phonenav__label">{compact && compactDetail ? `${label} · ${compactDetail}` : label}</span>
      </p>
      <button type="button" className="cdh-phonenav__change" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Schimbă
        <DossierIcon name="chevronDown" size={12} />
      </button>
      {open ? <SectionSheet customerId={customerId} clientName={clientName} section={section} attention={attention} hints={hints} onClose={() => setOpen(false)} /> : null}
    </nav>
  );
}

function SectionSheet({
  customerId,
  clientName,
  section,
  attention,
  hints,
  onClose,
}: {
  customerId: string;
  clientName: string;
  section: ClientHubSection;
  attention: SectionAttention;
  hints: SectionCounts;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="cdh-sheet"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="cdh-sheet__head">
        <h2 id={titleId}>{`${clientName} · secțiuni`}</h2>
        <button type="button" className="cdh-sheet__close" onClick={onClose}>
          Închide
        </button>
      </div>
      <ul className="cdh-sheet__list">
        {CLIENT_HUB_PRIMARY_SECTIONS.map((item) => {
          const href = sectionHref(customerId, item);
          const hint = hints[item] ?? CLIENT_HUB_SECTION_HINT[item];
          return (
            <li key={item}>
              <a
                className="cdh-sheet__item"
                href={href}
                aria-current={item === section ? "page" : undefined}
                onClick={(event) => {
                  replaceSection(event, href);
                  onClose();
                }}
              >
                {SECTION_ICON[item] ? <DossierIcon name={SECTION_ICON[item]!} size={16} /> : null}
                <span className="cdh-sheet__text">
                  <span className="cdh-sheet__label">{CLIENT_HUB_SECTION_LABEL[item]}</span>
                  {attention[item] ? <span className="cdh-sheet__attention">{attention[item]}</span> : hint ? <span className="cdh-sheet__hint">{hint}</span> : null}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </dialog>
  );
}
