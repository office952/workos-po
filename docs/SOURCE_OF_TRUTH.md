# Source of truth

## Authorities

```text
BUSINESS_SOURCE_OF_TRUTH = office952/workos-final @ 084ddebb
BUSINESS_ENGINE_IN_PO = apps/api + packages/domain
PRESENTATION_SOURCE_OF_TRUTH = Owner-accepted WorkOs-F design
UI_IMPLEMENTATION_SOURCE = office952/workos-po
PRESENTATION_BASE_REPOSITORY = office952/workos-ui20
PRESENTATION_BASE_HEAD = 9446b6d7b2b4e6b7c8ff829de97c1a583c712366
```

## Business truth

Owned by [office952/workos-final](https://github.com/office952/workos-final):

- ProductDefinition
- Product Truth
- formulas
- technical quantities
- pricing
- EIC
- Quote
- Acceptance
- Order
- Production Release
- Execution Plan
- Atelier truth
- Execution truth
- customers
- permissions
- authentication
- SQLite / persistence
- backend APIs

The new UI must consume supported contracts. It must not independently implement them.

## Presentation truth

Owned by Owner-accepted WorkOs-F design:

- File: WorkOs-F
- File key: `M3Klzg7sulrtLSyxJBf3Vd`

See `docs/FIGMA_AUTHORITY.md`.

## UI implementation

Owned by this repository:

- UI
- UX
- layout
- presentation
- responsive behavior
- accessibility
- interaction states
- presentation models / adapters

## Bootstrap reference SHA

```text
WORKOS_FINAL_BASELINE_SHA = 02f9b203c7b657cdd24c83f73fc8180fcf23b314
LABEL = BOOTSTRAP_REFERENCE_ONLY
```

This SHA is bootstrap evidence only. It is **not** a permanent dependency pin.

## Current integrated transport

```text
WORKOS_FINAL_TRANSPORT_MAIN = 1f409ab728668d2daace37273055177075fecd7c
TRANSPORT_CONTRACT_ID = workos-ui-contract-v1
PR33 = MERGED
LABEL = LIVE_MAIN_AT_TRANSPORT_INTEGRATION
NOT_A_PIN = YES
```

Safe UI20 transport is canonical on that `workos-final` main. Isolated UI20 must not import `@workos-final/domain` or resubmit ProductDefinition as business authority.

Do not freeze future development to a cached SHA.

**CURRENT WORKOS FINAL MUST ALWAYS BE VERIFIED LIVE.**

Read the live `main` SHA from GitHub before treating any contract, API, or runtime fact as current.
