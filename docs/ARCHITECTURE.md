# Architecture

STATUS: FOUNDATION ACCEPTED / REFERENCE SLICE ACCEPTED / GOLDEN SPINE ACCEPTED / IMPLEMENTATION ACCEPTED / INTEGRATED_ON_MAIN = NO

## Boundary

`office952/workos-po` is the WorkOS PO product repository. The root package is the preserved UI20 frontend. `apps/api` and `packages/domain` are the imported Final engine at `084ddebb02950d058554eec01f3dc347790f4ca1`.

`office952/workos-final` remains the pinned business-engine source for this wave. Do not import Final `apps/web`.

## Data flow

```text
API
→ transport DTO
→ UI20 adapter
→ presentation model
→ view
```

The UI consumes supported contracts. It does not independently implement ProductDefinition, Product Truth, formulas, pricing, EIC, Quote, Acceptance, Order, Production Release, Execution Plan, eligibility, or readiness.

## Chosen stack

```text
React 19 + Vite 8 + TypeScript 5.8
CSS custom properties
Vitest + Testing Library
NO component library
NO Redux
NO GraphQL
NO generated domain models
```

Local development uses a same-origin Vite proxy to `/api` → `127.0.0.1:8787`.

## Presentation areas

Implemented in Foundation V1:

- shell
- foundation tokens / typography
- landmarks / accessibility
- transport boundary
- one proof surface

Reference Slice V1 adds the first real surfaces on the Foundation shell:

- `/admin/resources` Cost Evidence editor
- `/` LETTERS configurator, confirm, calculation presentation, quote freeze
- `/quotes/:productCode/:quoteSnapshotId` frozen quote re-read

Golden Spine Completion V1 extends the same shell with the minimum route set for one complete job:

- Clienți / Cereri / Catalog / Configurator
- Oferte (freeze, accept, order)
- Lucrări (release, execution plan, planned vs actual)
- Atelier / Execuție

Remaining products and horizontal thickening stay out of scope until a later Owner GO.
