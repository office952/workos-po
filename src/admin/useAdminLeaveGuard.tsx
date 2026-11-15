import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../components/Button";
import { CreationDialog } from "../components/CreationDialog";
import { describeDestination } from "../routing/destination";
import { useUnsavedChangesGuard } from "../routing/useUnsavedChangesGuard";

type Held = { proceed: () => void; destination: string };

type Options = {
  /** True while the page holds values the server has not saved. */
  dirty: boolean;
  /** What is unsaved, as the operator knows it. */
  subject: string;
  /**
   * Opens the page's own save flow — the same review or confirmation the change bar opens. Omit it
   * when nothing unsaved can be saved from here (the question then offers only stay or leave).
   */
  requestSave?: () => void;
  /** True while that flow is open or its save is running. */
  saveFlowOpen: boolean;
  /** Drops the unsaved values on „Pleacă fără salvare”. */
  onDiscard: () => void;
  /** An extra sentence for the question (for example what leaving cannot save). */
  note?: ReactNode;
};

/**
 * R3 safety fix · leaving an Administration page with unsaved values.
 *
 * Saving on the way out goes through the page's normal flow, never around it: the question opens the
 * same review/confirmation the change bar opens, and navigation continues only once that flow closed
 * with everything saved. A cancelled or failed flow keeps the page and its drafts and asks again.
 *
 * Built on the shared guard's `onHold` (registration, Back/Forward and the browser's reload/close
 * question stay there), so other modules keep their behaviour.
 */
export function useAdminLeaveGuard({ dirty, subject, requestSave, saveFlowOpen, onDiscard, note }: Options): ReactNode {
  const [held, setHeld] = useState<Held | null>(null);
  const [waiting, setWaiting] = useState<Held | null>(null);
  const [leaving, setLeaving] = useState<Held | null>(null);
  const discardRef = useRef(onDiscard);
  const stayRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    discardRef.current = onDiscard;
  });

  const shared = useUnsavedChangesGuard({
    dirty,
    subject,
    onHold: (proceed, destination) => setHeld({ proceed, destination }),
  });

  // The page's save flow decides, once it has closed: everything saved → continue; values left → ask again.
  if (waiting && !saveFlowOpen) {
    setWaiting(null);
    if (dirty) {
      setHeld(waiting);
    } else {
      setLeaving(waiting);
    }
  }

  // Navigation itself runs after the render, exactly once per confirmed save.
  useEffect(() => {
    leaving?.proceed();
  }, [leaving]);

  useEffect(() => {
    if (held) stayRef.current?.focus();
  }, [held]);

  if (!held) return shared;

  const target = held;
  const where = describeDestination(target.destination, window.location.pathname);
  const canSave = Boolean(requestSave);

  function stay(): void {
    setHeld(null);
  }

  function leaveWithoutSaving(): void {
    setHeld(null);
    discardRef.current();
    target.proceed();
  }

  function reviewAndSave(): void {
    if (!requestSave) return;
    setHeld(null);
    setWaiting(target);
    requestSave();
  }

  return (
    <CreationDialog title="Ai modificări nesalvate" onDismiss={stay}>
      <p className="ui-note">
        {canSave
          ? `${subject} nu sunt salvate. Dacă pleci spre ${where}: le poți revizui și salva înainte, poți rămâne aici sau poți pleca fără salvare.`
          : `${subject} nu sunt salvate. Dacă pleci spre ${where}, se pierd.`}
      </p>
      {note ? <p className="ui-note">{note}</p> : null}
      <div className="unsaved-guard__actions">
        {canSave ? <Button onClick={reviewAndSave}>Revizuiește și salvează</Button> : null}
        <Button ref={stayRef} variant={canSave ? "secondary" : "primary"} onClick={stay}>
          Rămân pe pagină
        </Button>
        <Button variant="secondary" onClick={leaveWithoutSaving}>
          Pleacă fără salvare
        </Button>
      </div>
    </CreationDialog>
  );
}
