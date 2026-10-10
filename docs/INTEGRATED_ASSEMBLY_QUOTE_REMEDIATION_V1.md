# Integrated assembly & quote remediation V1

## Source identity

- Repository: `office952/workos-po`
- Branch: `feat/integrated-assembly-quote-remediation-v1`
- HEAD: `525bace` (BACK transport fix; implementation `ceffae8` + EIC `6efbbe0`)
- Base: `origin/main` @ `88c53ea` (includes PR #64 two-product invariants)
- Includes: PR #65 EIC reconciliation (cherry-pick `ef44276`), PR #63 rules adapted without flat-BACK SKU

## PR #63 / #65 mapping

| Item | Decision |
|------|----------|
| Separate `PRD-LETTERS-FRONTLIT-PLEXI-AL06-FLAT-BACK` SKU | **Discard** |
| `backCompatibility` / `backManufacturing` / compiler fail-closed | **Keep** |
| Configurator stale-preview hardening (full PR #63 UI) | **Defer** — not required for assembly convergence |
| `reconcileAssemblyEic` + tests | **Keep** (PR #65) |
| Fourth-product enablement churn | **Avoid** — three default templates unchanged |

## Product truth

- One canonical letters code: `PRD-LETTERS-FRONTLIT-PLEXI-AL06`
- Mounting on ACM uses draft `constructive.mountingContext = acm_panel` (UI-only guidance) plus explicit `back.supportKind` / `back.profile`
- Standalone letters omit constructive BACK fields → legacy Forex area behavior preserved
- ACM remains `PRD-ACM-CASSETTE-NONE`; assembly kinds unchanged

## BACK read-only root cause (PR66 acceptance)

**Cause:** `valuesForTransport()` in `src/adapters/formSchemaAdapter.ts` sent only field IDs present in the **last visible** preview schema. `constructive.mountingContext` (and thus the conditional `back.*` section) is not in that visible set on cycle 2+, so preview dropped ACM-mount BACK fields and `buildWorkbenchSections()` rendered **Spate** as read-only (zero editable fields).

**Fix:** Merge `valuesBeforeSchema(drafts)` with schema-aware coercion so constructive gating keys survive every preview/confirm transport. No parallel UI model; canonical form schema unchanged.

## Validation (2026-10-10, acceptance pass)

| Step | Result |
|------|--------|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS (existing react-refresh warnings only) |
| `pnpm test` (root) | **109** files, **519** tests PASS |
| `pnpm build` | PASS |
| `pnpm engine:lint` | PASS |
| `pnpm engine:typecheck` | PASS |
| `pnpm engine:test` | domain **101** files / **669** tests + api **90** files / **560** tests PASS |
| `pnpm engine:build` | PASS |
| GitHub **WorkOS Verify** @ `525bace` | **PASS** — [run 38083033951](https://github.com/office952/workos-po/actions/runs/38083033951/job/114303692237) |
| Synthetic E2E @ `127.0.0.1:8788` | **PASS** (API journey + browser); `8787` reference **not** touched |

### Deterministic tests (invariants)

- `packages/domain/src/product/back.test.ts` — Forex from face area when constructive BACK absent
- `packages/domain/src/product/lettersMountingContext.test.ts` — mounting context + fail-closed grooved
- `packages/domain/src/assembly/assemblyEic.test.ts` — reconciled assembly EIC; mount/QC **PARTIAL**
- `packages/domain/src/assembly/assembly.test.ts` — ACM vs letters resource separation (PR #64)

### Synthetic E2E evidence (@ `127.0.0.1:8788`, PR66 `dist` + `.tmp/integrated-e2e-reference`)

**API journey (owner session):** cerere nouă → assembly → member confirm (letters with `constructive.mountingContext=acm_panel` + `back.*`) → member confirm (ACM) → confirm assembly → **Pregătește oferta** → grouped quote **743.48 EUR** with **2** sections (Litere 624.82 + Panou ACM 118.66). Example IDs: `asm:c9a1a3db-…`, `crq:3a90481f-…`.

**Browser:** Spate layer shows editable **Suport constructiv** / **Profil spate** comboboxes after fix; assembly page shows **Confirmat** + grouped offer sections.

**Forex vs ACM (manufacturing truth):** domain tests `lettersMountingContext.test.ts` assert **FOREX_10MM** requirement on letters BACK from face area and **no ACM_3MM** on letters; ACM panel product carries ACM separately. Grouped quote preserves **two child commercial sections**, not a blended material line.

**Stale protection:** `product-assembly.test.ts` covers member reconfirm → assembly `stale` until `/review` (same API contract used in production).

Screenshots (local, gitignored): `%LOCALAPPDATA%\\Temp\\cursor\\screenshots\\` — `page-2026-10-10T20-16-26-711Z.png` (Spate BACK fields), `page-2026-10-10T20-16-40-666Z.png` (grouped assembly quote).

## Pricing completeness

- Child product quotes remain separate truths; assembly commercial = sum of child quotes (unchanged)
- Letters Forex vs ACM sheet material stay on separate child configurations
- Assembly production EIC uses reconciled graph; mount/QC/pack lines **PARTIAL** (not priced as zero)

## Known limitations

- Assembly mount/QC/pack operations remain **PARTIAL** EIC until Owner-approved cost evidence exists
- Grooved / metal-frame BACK still blocked (no fictional groove pricing)
- PR #63 configurator composition-tab stale UX not fully ported
- Assembly mount/QC/pack EIC costs remain **PARTIAL** (not zero)

## Owner acceptance checklist

- [x] Cerere → Litere pe panou → configure letters (Spate constructive fields editable when on ACM) → configure ACM → confirm assembly → grouped quote (synthetic 8788)
- [ ] Standalone letters unchanged vs historical snapshots
- [ ] Forex and ACM lines separate in cost evidence
- [x] `pnpm verify:all` green on PR branch
- [ ] Owner visual sign-off on screenshots
- [ ] Merge GO

## Final acceptance verdict (agent)

**READY FOR OWNER REVIEW** on PR #66 @ `525bace` — integrated remediation + BACK visibility fix + synthetic E2E pass. **Not OWNER_ACCEPTED** (merge/deploy withheld).
