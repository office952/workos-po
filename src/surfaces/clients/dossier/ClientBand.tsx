import { useEffect, useRef, useState } from "react";
import type { CommercialTermsModel } from "../../../adapters/customerDossierAdapter";
import type { CustomerTransport } from "../../../api/types";
import { clientsHref, newRequestHref, type ClientHubSection } from "../../../routing/appRoute";
import { navigate } from "../../../routing/navigate";
import { hrefPath, originBack } from "../../../routing/originBack";
import { agendaLetter } from "../clientsAgendaModel";
import { Monogram } from "../ClientsRegister";
import { useBandMode } from "./bandModel";
import { DossierIcon } from "./dossierIcons";
import { ClientActions, type ClientAction } from "./header/ClientActions";
import { ClientContacts } from "./header/ClientContacts";
import { ClientSectionNav, type SectionAttention, type SectionCounts } from "./header/ClientSectionNav";
import { clientContacts } from "./header/contactsModel";
import { useSectionDetail } from "./header/sectionDetail";

/**
 * Antetul dosarului clientului (N-020 design final · Figma 574:2203). Desktop: "← Toți clienții",
 * monogram, name with the status and "CUI · localitate", the principal contact in its own column
 * with "Toate contactele" (579:5369), "+ Cerere nouă" over "Alte acțiuni" (579:5140), then the
 * section tabs. Scrolled, identity, tabs and "+ Cerere nouă" fold into one line under the WorkOS
 * bar (579:6351). Tablet (588:7090): the contact on one line under the identity and the tabs with
 * "+ N secțiuni". Phone (649:14364): the contact in a card, the actions in a row and a dark
 * "Secțiunea · Schimbă" bar that stays at the top and, scrolled, names the client and what is in
 * view (580:4114).
 */
export function ClientBand({
  customerId,
  customer,
  terms,
  canCreate,
  actions,
  section,
  attention,
  hints,
  contactsEditHref,
  createTone = "primary",
}: {
  customerId: string;
  customer: CustomerTransport | null;
  terms: CommercialTermsModel | null;
  canCreate: boolean;
  /** "Alte acțiuni": only what the dossier permissions allow. */
  actions: readonly ClientAction[];
  section: ClientHubSection;
  /** R1: the sections the server flags (a dot in the navigation). */
  attention: SectionAttention;
  hints: SectionCounts;
  contactsEditHref: string | null;
  /** R1: teal outline where the section shows its own primary action. */
  createTone?: "primary" | "accent";
}) {
  const mode = useBandMode();
  const headRef = useRef<HTMLElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const band = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [shellHeight, setShellHeight] = useState(0);
  const detail = useSectionDetail(customerId);

  // The heights of the fixed layers place everything that sticks under them: the WorkOS bar, the
  // band with the sections, then the section tools and the year rail.
  useEffect(() => {
    const page = band.current?.closest<HTMLElement>(".chub");
    const shell = document.querySelector<HTMLElement>(".app-shell__bar");
    if (!page || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const measure = () => {
      const shellH = shell?.offsetHeight ?? 0;
      const headH = headRef.current?.offsetHeight ?? 0;
      const bandH = band.current?.offsetHeight ?? 0;
      const sticky = shellH + bandH;
      page.style.setProperty("--dh-shell-h", `${shellH}px`);
      page.style.setProperty("--dh-head-h", `${headH}px`);
      page.style.setProperty("--dh-band-h", `${bandH}px`);
      page.style.setProperty("--dh-sticky-top", `${sticky}px`);
      // Anchors and focused controls land below the fixed layers (the section tools stick too).
      root.style.scrollPaddingTop = `${sticky + 64 + 8}px`;
      setShellHeight(shellH);
    };
    const observer = new ResizeObserver(measure);
    [shell, headRef.current, band.current].forEach((node) => node && observer.observe(node));
    measure();
    return () => {
      observer.disconnect();
      root.style.scrollPaddingTop = "";
    };
  }, [mode]);

  // The band folds once the full header has passed under the WorkOS bar.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setCompact(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setCompact(entry ? !entry.isIntersecting : false), {
      rootMargin: `-${shellHeight}px 0px 0px 0px`,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [mode, shellHeight]);

  // The section tools read it too: folded, the search bar names the section (579:6351).
  useEffect(() => {
    const page = band.current?.closest<HTMLElement>(".chub");
    page?.toggleAttribute("data-band-compact", compact);
    return () => page?.removeAttribute("data-band-compact");
  }, [compact]);

  // Opened from the registry, the way back is that history entry (selection, search, filters,
  // scroll and focus as they were); from anywhere else it opens the registry on this client's row.
  const back = originBack({ href: clientsHref(customerId), label: "Clienți" }, (href) => hrefPath(href) === "/clienti");
  const backLabel = customer ? `Clienți · litera ${agendaLetter(customer.displayName)} · rândul ${customer.displayName}` : "Clienți";
  const name = customer?.displayName ?? "Client";
  const contacts = clientContacts(customer, terms);
  const createRequest = () => navigate(newRequestHref(customerId));
  const facts = customer ? [customer.cui ? `CUI ${customer.cui}` : null, mode === "phone" ? null : customer.city?.trim() || null].filter(Boolean).join(" · ") : "";

  return (
    <>
      <header ref={headRef} className="cdh" data-mode={mode} data-long-name={name.length > 32 || undefined}>
        <a className="cdh__back" href={back.href} onClick={back.onClick} aria-label={backLabel}>
          <span aria-hidden="true">←</span>
          <span aria-hidden="true">Toți clienții</span>
        </a>
        <div className="cdh__main">
          {customer && mode !== "phone" ? <span className="cdh__mono"><Monogram name={customer.displayName} size="large" /></span> : null}
          <div className="cdh__id">
            <h1 className="cdh__name" title={name}>{name}</h1>
            {customer ? (
              <p className="cdh__meta">
                <span className="cdh__status" data-status={customer.status}>
                  <span aria-hidden="true" className="cdh__status-dot" />
                  {`Client ${customer.statusLabel.toLowerCase()}`}
                </span>
                {facts ? <span className="cdh__facts">{facts}</span> : null}
              </p>
            ) : null}
          </div>
          {customer && mode === "desktop" ? <ClientContacts contacts={contacts} variant="column" editHref={contactsEditHref} /> : null}
          {mode !== "phone" ? <ClientActions canCreate={canCreate} onCreate={createRequest} actions={actions} layout="stack" createTone={createTone} /> : null}
        </div>
        {customer && mode === "tablet" ? <ClientContacts contacts={contacts} variant="line" editHref={contactsEditHref} /> : null}
        {customer && mode === "phone" ? <ClientContacts contacts={contacts} variant="card" editHref={contactsEditHref} /> : null}
        {mode === "phone" ? <ClientActions canCreate={canCreate} onCreate={createRequest} actions={actions} layout="row" createTone={createTone} /> : null}
      </header>
      <div ref={sentinel} className="chub-sentinel" aria-hidden="true" />
      <div ref={band} className="cdh-band" data-compact={compact || undefined} data-mode={mode}>
        {compact && mode !== "phone" ? (
          <div className="cdh-band__id">
            {customer ? <Monogram name={customer.displayName} /> : null}
            <p className="cdh-band__name" title={name}>{name}</p>
          </div>
        ) : null}
        <ClientSectionNav
          customerId={customerId}
          clientName={name}
          section={section}
          attention={attention}
          hints={hints}
          mode={mode}
          compact={compact}
          compactDetail={detail}
          back={{ href: back.href, onClick: back.onClick }}
        />
        {compact && mode !== "phone" && canCreate ? (
          <button type="button" className="cdh-create cdh-band__create" aria-label="Cerere nouă" onClick={createRequest} data-tone={createTone}>
            <DossierIcon name="plus" size={15} />
            <span className="cdh-create__label">Cerere nouă</span>
          </button>
        ) : null}
      </div>
    </>
  );
}
