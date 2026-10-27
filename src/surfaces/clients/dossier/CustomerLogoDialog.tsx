import { useEffect, useId, useRef, useState } from "react";
import { clearCustomerLogo, setCustomerLogo } from "../../../api/customerDossier";
import type { CustomerLogoTransport } from "../../../api/types";
import { Button } from "../../../components/Button";
import { InlineAlert } from "../../../components/InlineAlert";
import { ClientMark } from "../ClientMark";
import { refreshCustomerDossier } from "./dossierModel";
import { DossierFormDialog } from "./dossierShared";
import {
  checkLogoSize,
  LOGO_ACCEPT,
  LOGO_LIMITS_TEXT,
  logoFailure,
  logoReasonText,
  logoStateFrom,
  precheckLogoFile,
  readImageSize,
  type LogoFailure,
  type LogoState,
} from "./logoModel";
import "../../../styles/surfaces/client-logo-dialog.css";

type Selection = { file: File; url: string; width: number; height: number };
type Outcome = { kind: "saved"; text: string } | LogoFailure;

/**
 * N-023 · „Alte acțiuni” → „Sigla clientului”. The operator sees the current logo (or the monogram),
 * chooses a file, sees it exactly as the product will show it, and confirms. Nothing is sent before
 * „Confirmă sigla”. The server decides on the revision read here: a change made meanwhile by someone
 * else comes back as a conflict, the current logo is shown and the chosen file stays selected, so
 * the operator decides again with nothing lost. A refused or failed save keeps the selection too.
 * Choosing another file replaces the selection at once; only the latest choice can be confirmed,
 * and a file still being read counts as unsaved work when closing or leaving.
 */
export function CustomerLogoDialog({
  customerId,
  name,
  logo,
  logoRevision,
  onClose,
}: {
  customerId: string;
  name: string;
  logo: CustomerLogoTransport | null;
  logoRevision: number;
  onClose: () => void;
}) {
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<LogoState>({ logo, revision: logoRevision });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [reading, setReading] = useState(false);
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"set" | "clear" | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Every choice gets a number; only the latest one may become the selection. The URL of the file
  // being read is kept here so a newer choice, „Anulează” or closing can release it.
  const attemptRef = useRef(0);
  const readingUrlRef = useRef<string | null>(null);

  // The preview's temporary URL lives exactly as long as its selection.
  useEffect(() => () => {
    if (selection) URL.revokeObjectURL(selection.url);
  }, [selection]);
  // Closing (or leaving the page) while a file is read: its result is no longer wanted.
  useEffect(() => () => {
    attemptRef.current += 1;
    if (readingUrlRef.current) URL.revokeObjectURL(readingUrlRef.current);
    readingUrlRef.current = null;
  }, []);
  // The answer of the server takes the focus: the button that was pressed may be gone.
  useEffect(() => {
    if (outcome) resultRef.current?.focus({ preventScroll: false });
  }, [outcome]);

  /** Drops the file being read, if any: its answer will be ignored and its URL is released now. */
  function stopReading() {
    attemptRef.current += 1;
    if (readingUrlRef.current) URL.revokeObjectURL(readingUrlRef.current);
    readingUrlRef.current = null;
    setReading(false);
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    // A new choice replaces the previous one at once: the earlier file can no longer be confirmed,
    // whether the new one turns out valid, invalid or is still being read.
    stopReading();
    const attempt = attemptRef.current;
    setSelection(null);
    setOutcome(null);
    setChoiceError(null);
    // The same file can be chosen again after a refusal or a cancel.
    if (inputRef.current) inputRef.current.value = "";
    const refused = precheckLogoFile(file);
    if (refused) {
      setChoiceError(logoReasonText(refused));
      return;
    }
    const url = URL.createObjectURL(file);
    readingUrlRef.current = url;
    setReading(true);
    let size: { width: number; height: number } | null;
    try {
      size = await readImageSize(url);
    } catch {
      size = null;
    }
    // A newer choice, „Anulează” or closing came first: that path already released the URL.
    if (attempt !== attemptRef.current) return;
    readingUrlRef.current = null;
    setReading(false);
    const tooLarge = size ? checkLogoSize(size) : null;
    if (!size || tooLarge) {
      URL.revokeObjectURL(url);
      setChoiceError(tooLarge ? logoReasonText(tooLarge) : "Fișierul nu poate fi afișat ca imagine. Este deteriorat sau nu este PNG, JPEG ori WebP.");
      return;
    }
    setSelection({ file, url, ...size });
  }

  function discard() {
    stopReading();
    setSelection(null);
    setChoiceError(null);
    setOutcome(null);
  }

  async function send(action: "set" | "clear") {
    if (busy || reading) return;
    if (action === "set" && !selection) return;
    setBusy(action);
    setOutcome(null);
    try {
      const body = action === "set" && selection ? await setCustomerLogo(customerId, selection.file, current.revision) : await clearCustomerLogo(customerId, current.revision);
      const next = logoStateFrom(body);
      if (next) setCurrent(next);
      if (action === "set") setSelection(null);
      setOutcome({
        kind: "saved",
        text: action === "set" ? "Sigla a fost salvată. Apare în fișa clientului și în registrul Clienți." : "Clientul folosește din nou monograma. Siglele anterioare rămân în istoric.",
      });
      refreshCustomerDossier(customerId);
    } catch (caught) {
      const failure = logoFailure(caught);
      if (failure.kind === "conflict") {
        if (failure.current) setCurrent(failure.current);
        refreshCustomerDossier(customerId);
      }
      setOutcome(failure);
    } finally {
      setBusy(null);
    }
  }

  const failedAction = outcome && outcome.kind === "error" ? (selection ? "set" : "clear") : null;
  return (
    <DossierFormDialog
      framed
      title="Sigla clientului"
      subtitle={name}
      subject="Modificările siglei"
      dirty={selection !== null || reading}
      busy={busy !== null}
      onClose={onClose}
    >
      <div className="dlogo">
        <div ref={resultRef} tabIndex={-1} className="dlogo__result">
          {outcome?.kind === "saved" ? (
            <InlineAlert tone="success" title="Modificarea a fost salvată.">{outcome.text}</InlineAlert>
          ) : outcome?.kind === "conflict" ? (
            <InlineAlert tone="error" title="Sigla a fost schimbată între timp de altcineva.">
              {selection
                ? "Nu s-a salvat nimic. Mai jos vezi sigla actuală; fișierul ales de tine a rămas selectat. Confirmă din nou dacă vrei să o înlocuiești."
                : "Nu s-a salvat nimic. Mai jos vezi sigla actuală; reia acțiunea dacă mai este nevoie."}
            </InlineAlert>
          ) : outcome?.kind === "refused" ? (
            <InlineAlert tone="error" title="Fișierul nu a fost acceptat.">{`${outcome.text} Nu s-a salvat nimic.`}</InlineAlert>
          ) : outcome?.kind === "error" ? (
            <InlineAlert tone="error" title="Modificarea nu s-a salvat.">{outcome.text}</InlineAlert>
          ) : null}
        </div>

        <div className="dlogo__grid">
          <section className="dlogo__panel" aria-labelledby={`${inputId}-current`}>
            <h3 id={`${inputId}-current`} className="dlogo__heading">Acum</h3>
            <div className="dlogo__stage">
              <ClientMark name={name} logo={current.logo} size="large" />
            </div>
            <p className="ui-note">{current.logo ? `Sigla încărcată · ${current.logo.width} × ${current.logo.height} px` : "Fără siglă: se afișează monograma."}</p>
          </section>

          <section className="dlogo__panel" aria-labelledby={`${inputId}-next`} data-empty={!selection || undefined}>
            <h3 id={`${inputId}-next`} className="dlogo__heading">Previzualizare</h3>
            {selection ? (
              <>
                <div className="dlogo__stage" data-preview>
                  <span className="cagenda-mono client-mark" data-size="large" data-logo="" aria-hidden="true">
                    <img src={selection.url} alt="" />
                  </span>
                  <span className="cagenda-mono client-mark" data-logo="" aria-hidden="true">
                    <img src={selection.url} alt="" />
                  </span>
                </div>
                <p className="ui-note dlogo__file">{`${selection.file.name} · ${selection.width} × ${selection.height} px`}</p>
                <p className="ui-note">Proporțiile și culorile se păstrează; sigla nu este decupată sau întinsă.</p>
              </>
            ) : (
              <p className="ui-note">{reading ? "Se citește imaginea…" : "Alege un fișier ca să vezi cum va arăta."}</p>
            )}
          </section>
        </div>

        <div className="dlogo__choose">
          <input
            ref={inputRef}
            id={inputId}
            className="dlogo__input"
            type="file"
            accept={LOGO_ACCEPT}
            aria-describedby={hintId}
            disabled={busy !== null}
            onChange={(event) => void choose(event.target.files?.[0])}
          />
          <label htmlFor={inputId} className="dlogo__pick" data-disabled={busy !== null || undefined}>
            {selection ? "Alege alt fișier" : "Alege fișier"}
          </label>
          <p id={hintId} className="ui-note">{LOGO_LIMITS_TEXT}</p>
          {choiceError ? (
            <p className="dlogo__error" role="alert">{choiceError}</p>
          ) : null}
        </div>

        <div className="cdos-bar">
          <p className="ui-note">Sigla este opțională și nu schimbă ofertele, comenzile, documentele sau fotografiile clientului.</p>
          <div className="cdos-actions">
            {selection || reading ? (
              <>
                {/* While a file is read there is nothing to confirm yet. */}
                {selection && !reading ? (
                  <Button disabled={busy !== null} onClick={() => void send("set")}>
                    {busy === "set" ? "Se salvează…" : failedAction === "set" ? "Reîncearcă" : "Confirmă sigla"}
                  </Button>
                ) : null}
                <Button variant="secondary" disabled={busy !== null} onClick={discard}>Anulează</Button>
              </>
            ) : (
              <>
                {current.logo ? (
                  <Button variant="secondary" disabled={busy !== null} onClick={() => void send("clear")}>
                    {busy === "clear" ? "Se salvează…" : failedAction === "clear" ? "Reîncearcă" : "Folosește monograma"}
                  </Button>
                ) : null}
                <Button variant="secondary" disabled={busy !== null} onClick={onClose}>Închide</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </DossierFormDialog>
  );
}
