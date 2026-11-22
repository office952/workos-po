import { useCallback, useEffect, useRef, useState } from "react";
import {
  presentQuoteVariant,
  presentQuoteVariantConflict,
  presentQuoteVariantDetail,
  type QuoteVariantConflict,
  type QuoteVariantView,
} from "../adapters/quoteVariantAdapter";
import { TransportError, readTransportReasons } from "../api/http";
import {
  createRequestVariant,
  fetchRequestVariant,
  saveRequestVariantDraft,
  saveRequestVariantPrice,
} from "../api/quoteVariants";

/**
 * Commercial Continuity V2 · the saved quote variant behind the Configurator.
 * The variant lives on the server from the moment the product is chosen. This module loads it,
 * saves what the person types as they type, and never overwrites someone else's save: a stale
 * write is refused by the server and shown here with who saved and when.
 */

export type VariantSaveState = "idle" | "saving" | "saved" | "failed" | "conflict";

export const VARIANT_AUTOSAVE_DEBOUNCE_MS = 700;

export type QuoteVariantWork = ReturnType<typeof useQuoteVariant>;

export function useQuoteVariant(requestId: string | null, variantId: string | null) {
  const enabled = Boolean(requestId && variantId);
  const [variant, setVariant] = useState<QuoteVariantView | null>(null);
  const [initialValues, setInitialValues] = useState<Record<string, unknown> | null>(null);
  const [loadState, setLoadState] = useState<"none" | "loading" | "ready" | "error">(enabled ? "loading" : "none");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveState, setSaveState] = useState<VariantSaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [conflict, setConflict] = useState<QuoteVariantConflict | null>(null);
  const versionRef = useRef<number | null>(null);

  const adopt = useCallback((payload: unknown): QuoteVariantView | null => {
    const presented = presentQuoteVariant(payload);
    if (presented) {
      versionRef.current = presented.version;
      setVariant(presented);
    }
    return presented;
  }, []);

  useEffect(() => {
    if (!requestId || !variantId) return;
    let cancelled = false;
    void (async () => {
      try {
        const detail = presentQuoteVariantDetail(await fetchRequestVariant(requestId, variantId));
        if (cancelled) return;
        if (!detail) {
          setLoadState("error");
          return;
        }
        versionRef.current = detail.variant.version;
        setVariant(detail.variant);
        setInitialValues(detail.values);
        setSavedAt(detail.variant.updatedAt);
        setConflict(null);
        setSaveState("idle");
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestId, variantId, loadAttempt]);

  /** Marks a refused write. Returns true when the refusal was a version conflict. */
  const noteRefusal = useCallback((body: unknown, fallback: string): boolean => {
    const found = presentQuoteVariantConflict(body);
    if (found) {
      setConflict(found);
      setSaveState("conflict");
      return true;
    }
    setSaveState("failed");
    setFailure(readTransportReasons(body)[0] ?? fallback);
    return false;
  }, []);

  const saveValues = useCallback(
    async (values: Record<string, unknown>): Promise<boolean> => {
      if (!requestId || !variantId || versionRef.current === null) return false;
      setSaveState("saving");
      setFailure(null);
      try {
        const result = await saveRequestVariantDraft(requestId, variantId, {
          expectedVersion: versionRef.current,
          values,
        });
        if (!result.ok) {
          noteRefusal(result.body, "Valorile nu au putut fi salvate.");
          return false;
        }
        const saved = adopt((result.body as { variant?: unknown } | null)?.variant);
        setSavedAt(saved?.updatedAt ?? new Date().toISOString());
        setSaveState("saved");
        return true;
      } catch {
        // Network or session: the values stay in the page and can be retried.
        setSaveState("failed");
        setFailure("Fără conexiune la server. Valorile rămân în pagină.");
        return false;
      }
    },
    [adopt, noteRefusal, requestId, variantId],
  );

  const savePrice = useCallback(
    async (netPrice: number | null): Promise<{ ok: true } | { ok: false; reasons: string[] }> => {
      if (!requestId || !variantId || versionRef.current === null) return { ok: false, reasons: [] };
      try {
        const result = await saveRequestVariantPrice(requestId, variantId, {
          expectedVersion: versionRef.current,
          netPrice,
        });
        if (!result.ok) {
          noteRefusal(result.body, "Prețul nu a putut fi salvat.");
          return { ok: false, reasons: readTransportReasons(result.body) };
        }
        adopt((result.body as { variant?: unknown } | null)?.variant);
        return { ok: true };
      } catch {
        return { ok: false, reasons: ["Fără conexiune la server. Prețul nu a fost salvat."] };
      }
    },
    [adopt, noteRefusal, requestId, variantId],
  );

  const saveNotes = useCallback(
    async (notes: string | null): Promise<boolean> => {
      if (!requestId || !variantId || versionRef.current === null) return false;
      setSaveState("saving");
      try {
        const result = await saveRequestVariantDraft(requestId, variantId, {
          expectedVersion: versionRef.current,
          notes,
        });
        if (!result.ok) {
          noteRefusal(result.body, "Observațiile nu au putut fi salvate.");
          return false;
        }
        const saved = adopt((result.body as { variant?: unknown } | null)?.variant);
        setSavedAt(saved?.updatedAt ?? new Date().toISOString());
        setSaveState("saved");
        return true;
      } catch {
        setSaveState("failed");
        setFailure("Fără conexiune la server. Observațiile rămân în pagină.");
        return false;
      }
    },
    [adopt, noteRefusal, requestId, variantId],
  );

  /** A refused confirm, approval or issue call: surfaces a conflict the same way a save does. */
  const noteError = useCallback(
    (error: unknown): boolean => (error instanceof TransportError ? Boolean(presentQuoteVariantConflict(error.body)) && noteRefusal(error.body, "") : false),
    [noteRefusal],
  );

  /** Keeps what the person typed as a new alternative of this variant; nothing is lost. */
  const keepMineAsAlternative = useCallback(
    async (values: Record<string, unknown>): Promise<string | null> => {
      if (!requestId || !variant) return null;
      const result = await createRequestVariant(requestId, {
        productCode: variant.productCode,
        alternativeOfVariantId: variant.variantId,
        values,
      });
      if (!result.ok) {
        setFailure(readTransportReasons(result.body)[0] ?? "Varianta alternativă nu a putut fi creată.");
        return null;
      }
      return presentQuoteVariant((result.body as { variant?: unknown } | null)?.variant)?.variantId ?? null;
    },
    [requestId, variant],
  );

  const reload = useCallback(() => {
    setLoadState("loading");
    setLoadAttempt((current) => current + 1);
  }, []);

  /** Re-reads the state the server decided, without touching what is being typed. */
  const refresh = useCallback(async (): Promise<void> => {
    if (!requestId || !variantId) return;
    try {
      const detail = presentQuoteVariantDetail(await fetchRequestVariant(requestId, variantId));
      if (detail) {
        versionRef.current = detail.variant.version;
        setVariant(detail.variant);
      }
    } catch {
      // The next action re-reads; a failed refresh never blocks the person.
    }
  }, [requestId, variantId]);

  return {
    enabled,
    variant,
    initialValues,
    loadState,
    loadAttempt,
    saveState,
    savedAt,
    failure,
    conflict,
    version: () => versionRef.current,
    setVersion: (version: number) => {
      versionRef.current = version;
    },
    adopt,
    saveValues,
    savePrice,
    saveNotes,
    noteError,
    keepMineAsAlternative,
    reload,
    refresh,
  };
}
