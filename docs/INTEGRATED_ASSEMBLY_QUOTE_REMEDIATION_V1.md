# Integrated assembly & quote remediation V1

## Source identity

- Repository: `office952/workos-po`
- Branch: `feat/integrated-assembly-quote-remediation-v1`
- HEAD: `b4628f8` (implementation `ceffae8` + EIC `6efbbe0`)
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

## Validation (2026-10-10)

| Check | Result |
|-------|--------|
| `pnpm verify:all` @ `ceffae8` | **PASS** (frontend + engine) |
| GitHub Actions **WorkOS Verify** on PR #66 | **PASS** — [run 38082200316](https://github.com/office952/workos-po/actions/runs/38082200316/job/114301246324) |
| Synthetic browser E2E | **PARTIAL** — isolated runtime `127.0.0.1:8788` (integrated build + owner-review seed); canonical `8787` reference left untouched |

### Deterministic tests (invariants)

- `packages/domain/src/product/back.test.ts` — Forex from face area when constructive BACK absent
- `packages/domain/src/product/lettersMountingContext.test.ts` — mounting context + fail-closed grooved
- `packages/domain/src/assembly/assemblyEic.test.ts` — reconciled assembly EIC; mount/QC **PARTIAL**
- `packages/domain/src/assembly/assembly.test.ts` — ACM vs letters resource separation (PR #64)

### Synthetic E2E evidence

Screenshots captured on integrated build served at `127.0.0.1:8788` (isolated synthetic root; `8787` reference untouched). Paths are gitignored locally under `docs/evidence/integrated-assembly-e2e-v1/`:

- `01-request-product-selection.png` — cerere → **Litere pe panou ACM** entry
- `02-assembly-guided-summary.png` — guided assembly summary + **Pregătește oferta**

Browser path exercised: login → cerere Delta Retail → **Începe: Panou ACM + litere volumetrice** → assembly workspace → open letters configurator (assembly member context). Full confirm → grouped quote not completed in this pass (timeboxed).

## Pricing completeness

- Child product quotes remain separate truths; assembly commercial = sum of child quotes (unchanged)
- Letters Forex vs ACM sheet material stay on separate child configurations
- Assembly production EIC uses reconciled graph; mount/QC/pack lines **PARTIAL** (not priced as zero)

## Known limitations

- Assembly mount/QC/pack operations remain **PARTIAL** EIC until Owner-approved cost evidence exists
- Grooved / metal-frame BACK still blocked (no fictional groove pricing)
- PR #63 configurator composition-tab stale UX not fully ported
- Configurator workbench may show **Spate** as read-only until preview reflects seeded `constructive.mountingContext`; constructive BACK fields live in form schema section `back` (domain tests cover truth; workbench visibility may need a follow-up if Owner cannot edit Suport/Profil spate in UI)

## Owner acceptance checklist

- [ ] Cerere → Litere pe panou → configure letters (Spate constructive fields editable when on ACM) → configure ACM → confirm assembly → grouped quote
- [ ] Standalone letters unchanged vs historical snapshots
- [ ] Forex and ACM lines separate in cost evidence
- [x] `pnpm verify:all` green on PR branch
- [ ] Review E2E screenshots (local `docs/evidence/integrated-assembly-e2e-v1/`, gitignored)
