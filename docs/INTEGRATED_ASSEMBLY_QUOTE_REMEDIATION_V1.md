# Integrated assembly & quote remediation V1

## Source identity

- Repository: `office952/workos-po`
- Branch: `feat/integrated-assembly-quote-remediation-v1`
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

## Known limitations

- Assembly mount/QC/pack operations remain **PARTIAL** EIC until Owner-approved cost evidence exists
- Grooved / metal-frame BACK still blocked (no fictional groove pricing)
- PR #63 configurator composition-tab stale UX not fully ported

## Owner acceptance checklist

- [ ] Cerere → Litere pe panou → configure letters (Spate visible) → configure ACM → confirm assembly → grouped quote
- [ ] Standalone letters unchanged vs historical snapshots
- [ ] Forex and ACM lines separate in cost evidence
- [ ] `pnpm verify:all` green on PR branch
