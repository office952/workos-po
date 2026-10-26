import { useEffect, useId, useRef, useState } from "react";
import { linkCustomerDocument, unlinkCustomerDocument } from "../../../api/customerDossier";
import type { CustomerDossierModel, DossierDocument } from "../../../adapters/customerDossierAdapter";
import { Button } from "../../../components/Button";
import { InlineAlert } from "../../../components/InlineAlert";
import { dossierErrorText, formatDay, refreshCustomerDossier } from "../dossier/dossierModel";
import { DossierIcon } from "../dossier/dossierIcons";
import { DossierFormDialog } from "../dossier/dossierShared";
import { linkTargetsOf, sameLink, type LinkTarget } from "./linkTargets";
import "../../../styles/surfaces/client-document-dialogs.css";

type AddState = { status: "saving" } | { status: "failed"; message: string };
type RemoveState = { status: "confirm" } | { status: "removing" } | { status: "failed"; message: string };

/**
 * „Asociază” (758:185 · confirmare 758:637 → 758:1027 → eșuată 758:1799 / reușită 758:1415 ·
 * parțial 758:2189 → 758:2610; telefon 786:634 → 760:213 → 786:708 → 786:751 / 786:872). The
 * server adds and removes one association per request, each on its own: there is no batch, no
 * atomic save and no undo. So the saved associations (the dossier's) stay apart from the
 * selection not yet saved; "Adaugă" sends each selected one and says exactly which were saved;
 * a retry sends only those that failed; removing asks first and is applied at once, by itself.
 * Closing gives up only the unsaved selection — what was saved or removed stays so.
 */
export function LinkDocumentDialog({ customerId, dossier, document, onClose }: { customerId: string; dossier: CustomerDossierModel; document: DossierDocument; onClose: () => void }) {
  const searchId = useId();
  const targets = linkTargetsOf(dossier);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<LinkTarget[]>([]);
  const [adding, setAdding] = useState<Record<string, AddState>>({});
  const [addedNow, setAddedNow] = useState<string[]>([]);
  const [report, setReport] = useState<{ saved: number; failed: number } | null>(null);
  const [removing, setRemoving] = useState<Record<string, RemoveState>>({});
  const [removed, setRemoved] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (report || removed) resultRef.current?.focus({ preventScroll: false });
  }, [report, removed]);
  const keyOf = (link: { kind: string; subjectId: string }) => `${link.kind}:${link.subjectId}`;
  const saved = document.links.map((link) => ({ ...link, target: targets.find((target) => sameLink(target, link)) ?? null }));
  const busy = Object.values(adding).some((state) => state.status === "saving") || Object.values(removing).some((state) => state.status === "removing");
  const pending = selected.filter((target) => !addedNow.includes(keyOf(target)));
  const failed = pending.filter((target) => adding[keyOf(target)]?.status === "failed");

  // Diacritics and case do not matter: „caseta” finds „Casetă”, as everywhere else in the dossier.
  const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("ro");
  const needle = plain(query.trim());
  const candidates = needle
    ? targets.filter((target) => !saved.some((link) => sameLink(target, link)) && !selected.some((item) => sameLink(item, target)) && plain(`${target.kindWord} ${target.label} ${target.detail ?? ""}`).includes(needle)).slice(0, 8)
    : [];

  async function addSelected() {
    const batch = failed.length ? failed : pending;
    if (!batch.length || busy) return;
    setReport(null);
    setRemoved(null);
    setAdding((current) => ({ ...current, ...Object.fromEntries(batch.map((target) => [keyOf(target), { status: "saving" } as AddState])) }));
    const results: Array<{ key: string; ok: boolean; message?: string }> = [];
    // One request per association, in order: each answer is known before the next is sent.
    for (const target of batch) {
      try {
        await linkCustomerDocument(customerId, document.documentId, target.kind, target.subjectId);
        results.push({ key: keyOf(target), ok: true });
      } catch (caught) {
        results.push({ key: keyOf(target), ok: false, message: dossierErrorText(caught) });
      }
    }
    const ok = results.filter((result) => result.ok).map((result) => result.key);
    setAdding((current) => {
      const next = { ...current };
      for (const result of results) {
        if (result.ok) delete next[result.key];
        else next[result.key] = { status: "failed", message: result.message ?? "" };
      }
      return next;
    });
    setAddedNow((current) => [...current, ...ok]);
    setSelected((current) => current.filter((target) => !ok.includes(keyOf(target))));
    setReport({ saved: ok.length, failed: results.length - ok.length });
    if (ok.length) refreshCustomerDossier(customerId);
  }

  async function remove(link: { kind: string; subjectId: string; label: string; kindLabel: string }) {
    const key = keyOf(link);
    setRemoving((current) => ({ ...current, [key]: { status: "removing" } }));
    setReport(null);
    try {
      await unlinkCustomerDocument(customerId, document.documentId, link.kind, link.subjectId);
      setRemoving((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setRemoved(`Asocierea cu ${link.label} a fost eliminată. Documentul nu mai apare la ${link.kindLabel.toLocaleLowerCase("ro")}.`);
      refreshCustomerDossier(customerId);
    } catch (caught) {
      setRemoving((current) => ({ ...current, [key]: { status: "failed", message: dossierErrorText(caught) } }));
    }
  }

  return (
    <DossierFormDialog framed title={`Asociază „${document.title}”`} subtitle={[document.kindLabel, document.documentNumber, formatDay(document.documentDate)].filter(Boolean).join(" · ")} subject="Asocierile selectate" dirty={pending.length > 0} busy={busy} onClose={onClose}>
      <div className="ddoclinks">
        {/* The answer of the server takes the focus: the button that was pressed may be gone. */}
        <div ref={resultRef} tabIndex={-1} className="ddoclinks__result">
          {report && report.failed ? (
            <InlineAlert tone="error" title={`${report.saved} din ${report.saved + report.failed} asocieri au fost adăugate. ${report.failed === 1 ? "Una nu s-a adăugat." : `${report.failed} nu s-au adăugat.`}`}>
              Asocierile adăugate rămân salvate. Reîncercarea trimite doar ce nu s-a adăugat.
            </InlineAlert>
          ) : report && report.saved ? (
            <InlineAlert tone="success" title={report.saved === 1 ? "Asocierea a fost adăugată." : `Toate cele ${report.saved} asocieri au fost adăugate.`}>Sunt salvate; documentul apare acum și acolo.</InlineAlert>
          ) : null}
          {removed ? <p className="ddoclinks__done" role="status"><DossierIcon name="check" size={14} />{removed}</p> : null}
        </div>

        <section aria-labelledby={`${searchId}-saved`}>
          <p id={`${searchId}-saved`} className="ddoclinks__label">{`Asocieri salvate · ${saved.length}`}</p>
          {saved.length ? (
            <ul className="ddoclinks__list">
              {saved.map((link) => {
                const key = keyOf(link);
                const state = removing[key];
                return (
                  <li key={key} className="ddoclinks__row" data-saved data-state={state?.status}>
                    <span className="ddoclinks__kind">{(link.target?.kindWord ?? link.kindLabel).toLocaleUpperCase("ro")}</span>
                    <span className="ddoclinks__text">
                      <span className="ddoclinks__title">{link.label}</span>
                      {link.target?.detail ? <span className="ddoclinks__detail">{link.target.detail}</span> : null}
                      {addedNow.includes(key) ? <span className="ddoclinks__now"><DossierIcon name="check" size={12} />Adăugată acum</span> : null}
                      {state?.status === "confirm" || state?.status === "removing" ? (
                        <span className="ddoclinks__ask">{`Elimini asocierea cu ${link.label}? Se aplică imediat, separat de adăugări. Documentul și ${link.kindLabel.toLocaleLowerCase("ro")} nu se șterg.`}</span>
                      ) : null}
                      {state?.status === "failed" ? <span className="ddoclinks__error">{`Eliminarea nu s-a aplicat. Asocierea a rămas salvată. ${state.message}`}</span> : null}
                    </span>
                    <span className="ddoclinks__actions">
                      {state?.status === "confirm" || state?.status === "removing" || state?.status === "failed" ? (
                        <>
                          <Button disabled={state.status === "removing"} onClick={() => void remove(link)}>
                            {state.status === "removing" ? "Se elimină…" : state.status === "failed" ? "Reîncearcă eliminarea" : "Elimină asocierea"}
                          </Button>
                          <Button variant="secondary" disabled={state.status === "removing"} onClick={() => setRemoving((current) => { const next = { ...current }; delete next[key]; return next; })}>Păstrează</Button>
                        </>
                      ) : (
                        <button type="button" className="ddoclinks__link" disabled={busy} onClick={() => setRemoving((current) => ({ ...current, [key]: { status: "confirm" } }))} aria-label={`Elimină asocierea cu ${link.label}`}>
                          Elimină…
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="ui-note">Documentul nu are acum nicio asociere; rămâne în dosarul clientului.</p>
          )}
        </section>

        <label className="ddoclinks__search" htmlFor={searchId}>
          <DossierIcon name="search" size={15} />
          <span className="u-visually-hidden">Caută lucrări, cereri sau sedii de adăugat</span>
          <input id={searchId} type="search" value={query} autoComplete="off" placeholder="Caută lucrări, cereri sau sedii de adăugat…" onChange={(event) => setQuery(event.target.value)} />
        </label>
        {needle ? (
          candidates.length ? (
            <ul className="ddoclinks__list ddoclinks__results" aria-label="Rezultate de adăugat">
              {candidates.map((target) => (
                <li key={keyOf(target)} className="ddoclinks__row">
                  <span className="ddoclinks__kind">{target.kindWord.toLocaleUpperCase("ro")}</span>
                  <span className="ddoclinks__text">
                    <span className="ddoclinks__title">{target.label}</span>
                    {target.detail ? <span className="ddoclinks__detail">{target.detail}</span> : null}
                  </span>
                  <span className="ddoclinks__actions">
                    <button type="button" className="ddoclinks__link" onClick={() => { setSelected((current) => [...current, target]); setQuery(""); setReport(null); }} aria-label={`Adaugă în selecție ${target.label}`}>
                      Adaugă în selecție
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ui-note">{`Nimic de adăugat pentru „${query.trim()}”. Asocierile deja salvate sau selectate nu se repetă.`}</p>
          )
        ) : null}

        {pending.length ? (
          <section aria-labelledby={`${searchId}-pending`}>
            <p id={`${searchId}-pending`} className="ddoclinks__label">{failed.length && report ? `Nu s-a adăugat · ${failed.length}` : `De adăugat · ${countText(pending.length)}`}</p>
            <ul className="ddoclinks__list">
              {pending.map((target) => {
                const state = adding[keyOf(target)];
                return (
                  <li key={keyOf(target)} className="ddoclinks__row" data-state={state?.status}>
                    <span className="ddoclinks__kind">{target.kindWord.toLocaleUpperCase("ro")}</span>
                    <span className="ddoclinks__text">
                      <span className="ddoclinks__title">{target.label}</span>
                      {target.detail ? <span className="ddoclinks__detail">{target.detail}</span> : null}
                      {state?.status === "saving" ? <span className="ddoclinks__detail">Se adaugă…</span> : null}
                      {state?.status === "failed" ? <span className="ddoclinks__error">{`Nu s-a adăugat: ${state.message} Rămâne selectată.`}</span> : null}
                    </span>
                    <span className="ddoclinks__actions">
                      <button type="button" className="ddoclinks__link" disabled={busy} onClick={() => { setSelected((current) => current.filter((item) => !sameLink(item, target))); setAdding((current) => { const next = { ...current }; delete next[keyOf(target)]; return next; }); }} aria-label={`Scoate din selecție ${target.label}`}>
                        Scoate din selecție
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* The bar stays at the bottom: what „Închide” keeps, and the actions. */}
        <div className="cdos-bar">
          <p className="ui-note">
            {failed.length && report
              ? `„Închide” lasă salvate cele ${report.saved} asocieri adăugate și renunță doar la ${failed.length === 1 ? "cea nereușită" : "cele nereușite"}.`
              : "Fiecare asociere se adaugă separat. „Închide” renunță doar la selecțiile nesalvate; nu anulează nimic deja salvat sau eliminat."}
          </p>
          <div className="cdos-actions">
            {pending.length ? (
              <Button disabled={busy} onClick={() => void addSelected()}>
                {busy ? "Se adaugă…" : failed.length && report ? `Reîncearcă ${failed.length === 1 ? "asocierea nereușită" : "asocierile nereușite"} (${failed.length})` : `Adaugă asocierile selectate (${pending.length})`}
              </Button>
            ) : null}
            <Button variant="secondary" disabled={busy} onClick={pending.length ? () => { setSelected([]); onClose(); } : onClose}>
              Închide
            </Button>
          </div>
        </div>
      </div>
    </DossierFormDialog>
  );
}

function countText(count: number): string {
  return count === 1 ? "1 selectată, nesalvată" : `${count} selectate, nesalvate`;
}
