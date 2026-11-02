import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_ATELIER_FIXTURE_KIND, DEMO_ATELIER_LEDGER } from "./demoAtelierIdentity.js";

/**
 * Records which preparation steps were applied, keyed by stable scenario keys,
 * plus the server IDs they produced. A step recorded once is never applied
 * again, so a value the Owner changes or clears later is not overwritten.
 * The ledger lives in the demo data root, outside Git.
 */
export type DemoLedgerData = {
  schemaVersion: 1;
  fixtureKind: typeof DEMO_ATELIER_FIXTURE_KIND;
  applied: Record<string, { at: string; detail?: string }>;
  ids: Record<string, string>;
};

export type DemoLedger = {
  has(key: string): boolean;
  mark(key: string, detail?: string): void;
  id(key: string): string | undefined;
  setId(key: string, value: string): void;
  snapshot(): DemoLedgerData;
};

function emptyLedger(): DemoLedgerData {
  return { schemaVersion: 1, fixtureKind: DEMO_ATELIER_FIXTURE_KIND, applied: {}, ids: {} };
}

function ledgerOver(data: DemoLedgerData, persist: (data: DemoLedgerData) => void): DemoLedger {
  return {
    has: (key) => key in data.applied,
    mark(key, detail) {
      data.applied[key] = { at: new Date().toISOString(), ...(detail ? { detail } : {}) };
      persist(data);
    },
    id: (key) => data.ids[key],
    setId(key, value) {
      if (data.ids[key] === value) {
        return;
      }
      data.ids[key] = value;
      persist(data);
    },
    snapshot: () => structuredClone(data),
  };
}

export function memoryDemoLedger(initial?: DemoLedgerData): DemoLedger {
  return ledgerOver(initial ? structuredClone(initial) : emptyLedger(), () => {});
}

/** File-backed ledger; each write goes to a temp file first, then replaces the ledger. */
export function fileDemoLedger(root: string): DemoLedger {
  const path = join(root, DEMO_ATELIER_LEDGER);
  let data = emptyLedger();
  if (existsSync(path)) {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as DemoLedgerData;
    if (parsed.fixtureKind !== DEMO_ATELIER_FIXTURE_KIND || parsed.schemaVersion !== 1) {
      throw new Error(`demo_ledger_incompatible:${parsed.fixtureKind}`);
    }
    data = parsed;
  }
  return ledgerOver(data, (next) => {
    const temp = `${path}.tmp`;
    writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`);
    renameSync(temp, path);
  });
}
