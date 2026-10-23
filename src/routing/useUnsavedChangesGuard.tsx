import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../components/Button";
import { CreationDialog } from "../components/CreationDialog";
import { InlineAlert } from "../components/InlineAlert";
import { describeDestination } from "./destination";
import { setNavigationGuard } from "./navigate";

type Options = {
  /** True while the page holds values the server has not saved. */
  dirty: boolean;
  /** What is unsaved, as the operator knows it: "Prioritatea și termenul", "Titlul și descrierea cererii". */
  subject: string;
  /**
   * Saves the values; resolves true only after the server accepted them. Without it the question
   * has no "Salvează și continuă" (creation forms save through their own button).
   */
  save?: () => Promise<boolean>;
  /** Replaces the dialog with the page's own confirmation (for example inside a creation dialog). */
  onHold?: (proceed: () => void, destination: string) => void;
  /** Drops the unsaved values on "Pleacă fără salvare" (for a page that stays mounted, e.g. another section). */
  onDiscard?: () => void;
};

/**
 * N-018 · unsaved changes hold in-app navigation and Back/Forward behind one question that names
 * the destination: "Salvează și continuă" (only where saving applies) leaves only after a
 * successful save — a failure keeps the values and offers a retry —, "Rămân pe pagină" keeps
 * everything, "Pleacă fără salvare" discards. Reload and closing the tab get the browser's own
 * confirmation.
 */
export function useUnsavedChangesGuard({ dirty, subject, save, onHold, onDiscard }: Options): ReactNode {
  const [held, setHeld] = useState<{ proceed: () => void; destination: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const saveRef = useRef(save);
  const holdRef = useRef(onHold);
  const discardRef = useRef(onDiscard);
  const stayRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    saveRef.current = save;
    holdRef.current = onHold;
    discardRef.current = onDiscard;
  });

  // Registered right after the render that made the page dirty (layout effect), so no navigation
  // can pass between the change and the guard.
  useLayoutEffect(() => {
    if (!dirty) return;
    const release = setNavigationGuard((destination, proceed) => {
      if (holdRef.current) {
        holdRef.current(proceed, destination);
        return true;
      }
      setFailed(false);
      setHeld({ proceed, destination });
      return true;
    });
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      release();
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty]);

  useEffect(() => {
    if (held) stayRef.current?.focus();
  }, [held]);

  if (!held) return null;

  function stay(): void {
    if (saving) return;
    setHeld(null);
    setFailed(false);
  }

  function leave(): void {
    const target = held;
    setHeld(null);
    target?.proceed();
  }

  function leaveWithoutSaving(): void {
    discardRef.current?.();
    leave();
  }

  async function saveAndContinue(): Promise<void> {
    if (saving || !saveRef.current) return;
    setSaving(true);
    setFailed(false);
    const saved = await saveRef.current().catch(() => false);
    setSaving(false);
    if (!saved) {
      setFailed(true);
      return;
    }
    leave();
  }

  const where = describeDestination(held.destination);
  const canSave = Boolean(save);
  return (
    <CreationDialog title="Ai modificări nesalvate" busy={saving} onDismiss={stay}>
      <p className="ui-note">
        {canSave
          ? `${subject} nu sunt salvate. Dacă pleci spre ${where}: poți salva și continua, rămâne aici sau pleca fără salvare.`
          : `${subject} nu sunt salvate. Dacă pleci spre ${where}, se pierd.`}
      </p>
      {failed ? (
        <InlineAlert tone="error" title="Salvarea a eșuat">
          Valorile au rămas pe pagină. Poți reîncerca sau poți rămâne pe pagină.
        </InlineAlert>
      ) : null}
      <div className="unsaved-guard__actions">
        {canSave ? (
          <Button disabled={saving} onClick={() => void saveAndContinue()}>
            {saving ? "Se salvează…" : failed ? "Reîncearcă și continuă" : "Salvează și continuă"}
          </Button>
        ) : null}
        <Button ref={stayRef} variant={canSave ? "secondary" : "primary"} disabled={saving} onClick={stay}>Rămân pe pagină</Button>
        <Button variant="secondary" disabled={saving} onClick={leaveWithoutSaving}>Pleacă fără salvare</Button>
      </div>
    </CreationDialog>
  );
}
