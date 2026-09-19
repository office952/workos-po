# E2E Reference Slice Pattern V1

> HISTORICAL EXECUTION ARTIFACT
> NOT CURRENT PRODUCT AUTHORITY
> CURRENT WORKOS PO SAAS CANON WINS

Practical reusable path for a WorkOS setting that feeds a server-owned calculation and a frozen snapshot.

```text
STATUS = IMPLEMENTED_AWAITING_INDEPENDENT_REVIEW
OWNER_ACCEPTED_REFERENCE_SLICE = NO
PRODUCT = PRD-LETTERS-FRONTLIT-PLEXI-AL06
RESOURCE = aluminium_return_profile
QUALIFIER = volumeDepthMm 60
```

## Reusable chain

```text
ORGANIZATION / ADMIN SETTING
→ persisted Cost Evidence
→ server lookup
→ product technical quantity
→ server formula / calculation
→ transport DTO
→ UI20 adapter
→ presentation model
→ UI
→ confirm
→ freeze
→ historical truth
```

UI20 never calculates the canonical monetary result. It may format values the server already returned.

## Test harness != product surface

```text
TEST HARNESS != PRODUCT SURFACE
```

Product UI contains production-capable operator behavior only.

Synthetic setup belongs outside operator UI:

- `src/test/referenceSliceHarness.ts`
- `src/test/snapshotProof.ts`
- isolated E2E / review scripts

The harness may:

- create a synthetic customer through the supported API **before** opening Configurator
- fill the canonical LETTERS values through normal form controls
- change the isolated 60 mm rate through Admin UI or a second-writer API call
- label snapshots A/B in evidence
- manufacture a stale `evidenceRowId` from a second writer

The harness must not live in:

- Configurator
- Admin resources
- Quote snapshot
- App shell / routing copy

Configurator receives an existing `customerId` from navigation context (`?customer=`), never by creating one. Missing seller or customer is a blocked state, not an auto-repair.

## Implementation checklist

- [x] Configuration surface uses Foundation shell and server-provided form schema
- [x] Permissions: Owner may edit settings; member/non-owner sees no enabled write
- [x] Persistence goes through the supported WorkOS API only
- [x] Version / concurrency: PATCH uses the current evidence row; stale token returns 409
- [x] Technical quantity is server-owned
- [x] Formula is server-owned
- [x] Cost Evidence lookup is server-owned
- [x] API transport is typed and fail-closed on incompatible health
- [x] UI adapter maps DTO → presentation without importing domain packages
- [x] Presentation model formats server numbers only
- [x] Loading keeps the current object and next action visible
- [x] Error keeps recoverability
- [x] Pending resolves from real HTTP completion
- [x] Confirm sends `{ values, reviewId }` from the latest preview
- [x] Snapshot freeze sends `{ values, reviewId, customerId }` only when those already exist
- [x] Historical immutability: re-read Snapshot A after Snapshot B (harness / evidence)
- [x] Configuration-change proof: new calculation uses the new setting
- [x] Disabled / simple / advanced: document current canon; do not invent org modes
- [x] Tests cover adapter, Owner-only edit, stale 409, preview, reviewId, confirm, freeze, missing context, harness isolation
- [x] Runtime QA on isolated data, not real Cloud / real customers
- [x] Responsive QA at 1440 / 1280 / 768
- [x] Keyboard QA, visible focus, 44×44 targets
- [x] Synthetic setup is outside operator UI

## Current organization reality

Isolated single-plane local runtime treats the operator as Owner. Amounts are visible and writes are allowed.

Cloud / multi-actor runtime omits Cost Evidence amounts for non-owners and rejects writes without Owner role. UI20 uses that transport signal (`amount` present + `writeState = READY`) instead of inventing Disabled / Basic / Advanced organization states.

Current Cost Evidence canon already has separate Owner-confirmed rows for 30 / 60 / 80 / 100 mm. Changing the 60 mm row must not make other depths inherit that rate. Depths without a row stay unpriced; do not invent a rate.

## Operator path for this slice

1. `/admin/resources` — edit the 60 mm aluminium profile rate
2. `/` or `/?customer=…` — configure LETTERS from the server form (empty until the operator or a later cerere/draft supplies values)
3. Confirm — read the Cost Evidence line returned by the server
4. Freeze the quote when seller and customer context already exist
5. Change the 60 mm rate through the same admin API
6. Confirm again — new rate, new cost
7. Freeze a new quote
8. Re-read the first snapshot — unchanged

A/B naming is evidence language, not operator UI.

## Ports

```text
NORMAL INTERACTIVE DEV = 127.0.0.1:5173 → /api → 127.0.0.1:8787
ISOLATED AUTOMATED E2E = existing workos-final high-port policy
```

Reclaim canonical ports with `pnpm ports:reclaim` or `pnpm dev:canonical`.
