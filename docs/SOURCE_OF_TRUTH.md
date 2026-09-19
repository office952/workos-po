# Source of truth

## Authorities

```text
CANONICAL_PRODUCT_REPOSITORY = office952/workos-po
PRESENTATION_AUTHORITY = workos-po root frontend
BUSINESS_ENGINE_AUTHORITY = workos-po/apps/api + workos-po/packages/domain
PERSISTENCE_IMPLEMENTATION_AUTHORITY = workos-po/apps/api
SOURCE_CODE = workos-po
REAL_BUSINESS_DATA = external persistent WorkOS data root / Operational Planes
PRESENTATION_DESIGN_AUTHORITY = Owner-accepted WorkOs-F design
```

Historical provenance, not continuing development pins:

```text
HISTORICAL_PRESENTATION_SOURCE = office952/workos-ui20
HISTORICAL_PRESENTATION_HEAD = 9446b6d7b2b4e6b7c8ff829de97c1a583c712366
HISTORICAL_ENGINE_SOURCE = office952/workos-final
HISTORICAL_ENGINE_HEAD = 084ddebb02950d058554eec01f3dc347790f4ca1
```

Future WorkOS development happens in `office952/workos-po` unless a later explicit Owner decision changes repository strategy.

Do not import or synchronize future business changes from `workos-final` by default.
Do not treat later `workos-ui20` commits as the live frontend.

```text
WORKOS_FINAL_CONTINUING_AUTHORITY = NO
WORKOS_UI20_CONTINUING_AUTHORITY = NO
NO PARALLEL PRODUCT TRUTH
```

## Code versus data

Repository authority and business data authority are different.

- Source code, API, domain, persistence implementation, and frontend live in this Git repository.
- Real customer and operational data live outside Git, in the external persistent WorkOS data root / Operational Planes.
- `WORKOS_CLOUD_ROOT` must remain external persistent storage.
- Real data must not live in Git.
- Importing the engine did not copy or migrate real customer or business data.
- Isolated proof used temporary SQLite only.

Real Cloud or real database mutation still requires an explicit Owner GO.

## Business truth

Owned by this repository's imported engine (`apps/api` + `packages/domain`):

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
- persistence implementation
- backend APIs

The root frontend must consume supported contracts. It must not independently implement them. It must not import `@workos-final/domain`.

## Presentation truth

Owned by Owner-accepted WorkOs-F design:

- File: WorkOs-F
- File key: `M3Klzg7sulrtLSyxJBf3Vd`

See `docs/FIGMA_AUTHORITY.md`.

## UI implementation

Owned by the preserved root frontend in this repository:

- UI
- UX
- layout
- presentation
- responsive behavior
- accessibility
- interaction states
- presentation models / adapters

## Historical bootstrap evidence

These SHAs remain provenance only. They are not living pins after authority handoff.

```text
WORKOS_FINAL_BASELINE_SHA = 02f9b203c7b657cdd24c83f73fc8180fcf23b314
LABEL = BOOTSTRAP_REFERENCE_ONLY

WORKOS_FINAL_TRANSPORT_MAIN = 1f409ab728668d2daace37273055177075fecd7c
TRANSPORT_CONTRACT_ID = workos-ui-contract-v1
PR33 = MERGED
LABEL = HISTORICAL_TRANSPORT_INTEGRATION_EVIDENCE
```
