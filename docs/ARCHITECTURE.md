# Architecture

STATUS: FOUNDATION ACCEPTED / REFERENCE SLICE ACCEPTED / GOLDEN SPINE ACCEPTED / IMPLEMENTATION ACCEPTED / ENGINE_CONSOLIDATION_V1 = COMPLETE / CLOUD_RUNTIME_AND_RECOVERY_V1 = SYNTHETIC_ONLY / PRODUCT_MODEL = SAAS_ONLY / PRIMARY_PRODUCT_DIRECTION = SAAS / ALTERNATIVE_PRODUCT_DELIVERY = NO / PRIMARY_USER_JOURNEY = COMPLETE / CURRENT_PROGRAM = PLANNING_WORKLOAD_V1 / CURRENT_PROGRAM_STATUS = PLN2_OWNER_ACCEPTED / EXECUTION_EXPANSION_V1_IMPLEMENTATION = COMPLETE / INTEGRATED / EXECUTION_EXPANSION_V1_OWNER_ACCEPTED = YES / NEXT_PROGRAM_SELECTION = PLANNING_WORKLOAD_V1 / NEXT_PROGRAM_PRIORITY = PLANNING_WORKLOAD_V1 / NEXT_PROGRAM_STATUS = PLN2_OWNER_ACCEPTED / OPERATIONS_CONTROL_V1 = COMPLETE / OWNER_ACCEPTED / PLN2 = COMPLETE / OWNER_ACCEPTED / OWNER_ACCEPTED_OPERATIONS_CONTROL_V1 = YES / PRODUCT_ASSEMBLY_FIRST_CLASS_JOB = COMPLETE / OWNER_ACCEPTED / OPERATIONS_CONTROL_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE / PLANNING_IMPLEMENTATION = OWNER_ACCEPTED / OWNER_ACCEPTED_PLANNING_IMPLEMENTATION = YES / CAPACITY_IMPLEMENTATION = CANCELLED_WEEKLY_SUPPLY / CF1_COMMERCIAL_VERTICAL_V1 = COMPLETE / CF1_OWNER_ACCEPTED_IMPLEMENTATION = YES / CF1_INTEGRATED_ON_MAIN = YES / CF1_MERGE = COMPLETE / CF2_CF3_TECHNICAL_CONFIGURATION_V1 = COMPLETE / CF2_CF3_OWNER_ACCEPTED_IMPLEMENTATION = YES / CF2_CF3_INTEGRATED_ON_MAIN = YES / CF4_NARROW_CONFIGURABLE_FORMULA_FOUNDATION_V1 = COMPLETE / CF4 = COMPLETE / CF4_OWNER_ACCEPTED_IMPLEMENTATION = YES / CF4_INTEGRATED_ON_MAIN = YES / CF5 = NOT_STARTED / STANDALONE_CF5_REQUIRED_BEFORE_LETTERS = NO / REMAINING_CONFIGURATION_FIRST_WORK = DOMAIN_BY_DOMAIN_WHEN_REQUIRED / LETTERS_PRODUCT_TRUTH_V1 = COMPLETE / LETTERS_PRODUCT_TRUTH_V1_OWNER_ACCEPTED_IMPLEMENTATION = YES / LETTERS_PRODUCT_TRUTH_V1_INTEGRATED_ON_MAIN = YES / ACM_PRODUCT_TRUTH_V1 = COMPLETE / ACM_PRODUCT_TRUTH_V1_OWNER_ACCEPTED_IMPLEMENTATION = YES / ACM_PRODUCT_TRUTH_V1_INTEGRATED_ON_MAIN = YES / PRODUCT_ENABLEMENT_ADMIN_V1 = COMPLETE / PRODUCT_ENABLEMENT_ADMIN_V1_OWNER_ACCEPTED_IMPLEMENTATION = YES / PRODUCT_ENABLEMENT_ADMIN_V1_INTEGRATED_ON_MAIN = YES / PEOPLE_AND_MACHINE_ADMIN_V1 = COMPLETE / PEOPLE_AND_MACHINE_ADMIN_V1_INTEGRATED_ON_MAIN = YES / PRODUCT_ENABLEMENT = ORGANIZATION_SCOPED / PRODUCT_ENABLEMENT_NEW_WORK_GATE = SERVER_AUTHORITATIVE / PRODUCT_ENABLEMENT_CONFIGURATION_SURFACE = /admin/products / CURRENT_TWO_PRODUCTS_DEFAULT = ENABLED / DEFAULT_DERIVED_FROM_ALL_REGISTRY_TEMPLATES = NO / FUTURE_UNCONFIGURED_PRODUCT = FAIL_CLOSED / HISTORICAL_LIFECYCLE = PRESERVED / ORG_ISOLATION = YES / PRODUCT_TRUTH_CHANGED = NO / SNAPSHOT_SCHEMA_CHANGED = NO / ACM_TEMPLATE_VERSION = 2 / PRODUCT_SCOPED_TECHNICAL_SETTING_RESOLUTION = YES / FRAME_CLEARANCE = ORGANIZATION_CONFIGURABLE_VERSIONED / CLIENT_PRODUCT_DEFINITION_AUTHORITY = REMOVED / VALUES_CRV1_AUTHORITY = REQUIRED / NEXT_WAVE_AUTHORIZED = NO / FORMULA_CONFIGURABILITY_FULLY_DELIVERED = NO / PLANNING_CAPACITY_CANON = docs/architecture/PLANNING_CAPACITY_V1_CANON.md

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

Primary product direction is SaaS. Primary product runtime is Cloud: browser access, email/password Cloud session, organization tenancy, same-origin production topology. See `docs/PRODUCTION_RUNTIME.md`.

Normal product startup requires `WORKOS_CLOUD_ROOT` and fails closed without it. Explicit single-plane construction remains a test/internal helper, not a deployment mode. Local loopback runtimes and synthetic Cloud roots are engineering infrastructure, not a customer product variant. Vite remains development only.

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

## Product Assembly

Owner-accepted architecture direction: `docs/architecture/WORKOS_PRODUCT_ASSEMBLY_CONTRACT_V1.md`.

```text
PRODUCT_ASSEMBLY_CONTRACT_V1 = OWNER_ACCEPTED_ARCHITECTURE_DIRECTION
PRODUCT_ASSEMBLY_V1 = COMPLETE / OWNER_ACCEPTED
PRODUCT_ASSEMBLY_IMPLEMENTATION = COMPLETE / INTEGRATED
OWNER_ACCEPTED_PRODUCT_ASSEMBLY_V1 = YES
```

Narrow V1 is Owner-accepted and integrated: one ACM panel and one Letters product, related by `LETTERS_ON_ACM_PANEL`. Standalone products still compile, confirm, and freeze one ProductTemplate at a time.

```text
VOLUMETRIC_LOGO_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_VOLUMETRIC_LOGO_V1 = YES
PRODUCT_ASSEMBLY_V2 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_PRODUCT_ASSEMBLY_V2 = YES
VOLUMETRIC_LOGO_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
PRODUCT_ASSEMBLY_V2_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
HOST_CONTEXT_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_HOST_CONTEXT_V1 = YES
MOUNTING_INTERFACE_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_MOUNTING_INTERFACE_V1 = YES
SITE_INSTALLATION_VERTICAL_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_SITE_INSTALLATION_VERTICAL_V1 = YES
HOST_CONTEXT_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
MOUNTING_INTERFACE_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
SITE_INSTALLATION_VERTICAL_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
```

Logo V1 is the specific front-lit SKU `PRD-LOGO-FRONTLIT-PLEXI-AL06`. It is disabled until an organization enables it. Assembly V2 is `SIGN_ASSEMBLY_ACM_SIGNAGE_V2`: one ACM, one Logo, and optional Letters. V1 semantics stay in place. Host Context V1 is Owner-accepted as a frozen projection of SiteInstallationFacts. It is not a product. Mounting Interface V1 and the site-installation vertical are Owner-accepted. ACM segmentation and a generic assembly graph remain unimplemented. `ProductAggregate.inscription` remains the transport field for the logo designation; the operator label is Denumire logo.

## Configuration-First

Living architecture for changeable business truth: `docs/architecture/WORKOS_CONFIGURATION_FIRST_CANON.md`.

The engine remains the only evaluator. Configuration is domain-owned data with shared resolution semantics. This is not a second Product Truth, not a mega Settings blob, and not an implementation authorization.

People and Machine Admin V1 is complete and integrated on main. Product Enablement Admin V1, Letters Product Truth V1, and ACM Product Truth V1 remain complete. Organization-scoped product availability is configured on `/admin/products`. The server is authoritative for new-work gates. The current Letters and ACM templates remain enabled by an explicit V1 compatibility default; a future unconfigured ProductTemplate fails closed. Historical frozen lifecycle is preserved. Product enablement is not ProductTruth and does not change snapshot schema. Standalone CF5 is not required. Remaining Configuration-First work is domain-by-domain when required. Execution Expansion V1 is Owner-accepted and integrated. Current program is Planning Workload V1. PLN1 is Owner-accepted. PLN2 and Operations Control V1 are Owner-accepted. An accepted Product Assembly is one operational job. PLN3 is not started. Product Assembly V1 is Owner-accepted and integrated. It does not replace the Planning program. Volumetric Logo V1 and Product Assembly V2 are Owner-accepted. They do not replace V1 or the Planning program. Acceptance advisories are recorded and are not a correction wave. Scheduling is out of V1. Next wave is unauthorized.
