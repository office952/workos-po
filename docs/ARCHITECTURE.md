# Architecture

STATUS: FOUNDATION ACCEPTED / REFERENCE SLICE ACCEPTED / GOLDEN SPINE ACCEPTED / IMPLEMENTATION ACCEPTED / ENGINE_CONSOLIDATION_V1 = COMPLETE / CLOUD_RUNTIME_AND_RECOVERY_V1 = SYNTHETIC_ONLY / PRIMARY_PRODUCT_DIRECTION = CLOUD_WEB / LOCAL_PRODUCT_RUNTIME = DEFERRED_NOT_V1_REQUIREMENT

## Boundary

`office952/workos-po` is the canonical WorkOS product repository.

It contains the preserved accepted frontend, the imported API, domain, persistence implementation, and business engine.

```text
PRESENTATION_AUTHORITY = workos-po root frontend
BUSINESS_ENGINE_AUTHORITY = workos-po/apps/api + workos-po/packages/domain
PERSISTENCE_IMPLEMENTATION_AUTHORITY = workos-po/apps/api
```

`office952/workos-ui20` at `9446b6d` is historical presentation provenance.
`office952/workos-final` at `084ddebb` is historical engine provenance.

Do not import Final `apps/web`. Do not keep a second active business engine in `workos-final`.

## Data flow

```text
API
→ transport DTO
→ UI20 adapter
→ presentation model
→ view
```

The UI consumes supported contracts. It does not independently implement ProductDefinition, Product Truth, formulas, pricing, EIC, Quote, Acceptance, Order, Production Release, Execution Plan, eligibility, or readiness.

## Persistence and data

Persistence implementation lives in `apps/api`.

Real business data lives outside Git, in the external persistent WorkOS data root / Operational Planes. `WORKOS_CLOUD_ROOT` remains external. Engine consolidation did not cut over the real Cloud root.

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

Local development uses a same-origin Vite proxy to `/api` → `127.0.0.1:8787`. Isolated proof may override the proxy target without changing presentation.

## Production runtime

Same-origin HTTPS reverse proxy → built frontend → `/api` → single Node API → external `WORKOS_CLOUD_ROOT`. See `docs/PRODUCTION_RUNTIME.md`. Isolated synthetic backup/restore is authorized. Real HUB MEDIA cutover is not.

## Product runtime

Primary product runtime is Cloud Web: browser access, email/password Cloud session, organization tenancy, same-origin production topology. See `docs/PRODUCTION_RUNTIME.md`.

Normal product startup requires `WORKOS_CLOUD_ROOT` and fails closed without it. Explicit single-plane construction remains a test/internal helper, not a deployment mode. Local/Windows product runtime is deferred and is not a V1 requirement. Vite remains development only.

## Tooling advisory

```text
ENGINE_LINT_COVERAGE = REQUIRED
```

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
