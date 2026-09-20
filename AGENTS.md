# WorkOS PO agent contract

## Repository identity

This repository is:

`office952/workos-po`

If the working repository is not exactly that:

**STOP.**

Do not continue implementation, commit, or push until the working tree is the WorkOS PO repository.

```text
ONE_PRODUCT_REPOSITORY = office952/workos-po
CANONICAL_PRODUCT_REPOSITORY = office952/workos-po
```

## Authority

```text
PRESENTATION_AUTHORITY = workos-po root frontend
BUSINESS_ENGINE_AUTHORITY = workos-po/apps/api + workos-po/packages/domain
PERSISTENCE_IMPLEMENTATION_AUTHORITY = workos-po/apps/api
SOURCE_CODE = workos-po
REAL_BUSINESS_DATA = external persistent WorkOS data root / Operational Planes
```

Future WorkOS development happens here unless a later explicit Owner decision changes repository strategy.

```text
WORKOS_FINAL_CONTINUING_AUTHORITY = NO
WORKOS_UI20_CONTINUING_AUTHORITY = NO
```

`office952/workos-final` is historical/reference at `084ddebb`.
`office952/workos-ui20` is historical/reference at `9446b6d`.

Do not import or synchronize future WorkOS business changes from `workos-final` by default.
Do not silently fast-forward the frontend from a later UI20 commit.
Do not import Final `apps/web`.
Do not use Pass A reconstruction as the frontend source.

Never commit WorkOS PO work to `workos-final` or `workos-ui20`.

```text
workos-final != workos-po
workos-ui20 != workos-po
```

## Hard boundary

The preserved root frontend is the only UI.

There is one business engine: the packages in this repository. Do not maintain a second active engine in `workos-final`.

```text
NO PARALLEL PRODUCT TRUTH
NO SECOND PRICING ENGINE
NO SECOND EXECUTION ENGINE
NO CLIENT-SPECIFIC CODE FORK
```

## Forbidden duplication

Never copy or independently implement in the frontend, and never create a second owner of:

- pricing formulas
- technical formulas
- ProductDefinition
- Product Truth
- Quote engine
- Order engine
- Production Release engine
- execution state machine
- eligibility logic
- business readiness logic
- database schema

## Integration rule

```text
WORKOS PO API
→ typed transport contract
→ adapter
→ presentation model
→ UI
```

Never:

```text
UI → duplicated business calculation
```

UI may code experience: layout, reusable components, interaction, responsive behavior, generic renderers.

UI must not hardcode business truth: product fields, materials, formulas, pricing, costs, readiness, dependencies, module activation, business statuses, totals, commercial flows, or Product Truth.

The root frontend must not import `@workos-final/domain`.

## Data

Real business data is external. It must not live in Git. `WORKOS_CLOUD_ROOT` remains external persistent storage.

Copying the engine did not copy or migrate real customer data.

## Language

- Operator-facing UI: Romanian
- Code / internal identifiers: English permitted

Normal operator UI does not expose internal jargon: hashes, DTO names, raw codes, service names, compiler vocabulary, raw provenance, debug objects, or internal JSON.

## Tooling advisory

```text
ENGINE_LINT_COVERAGE = REQUIRED
```

`pnpm lint` remains the root frontend linter. `pnpm engine:lint` covers `apps/api` and `packages/domain`. Do not downgrade frontend lint to make the engine pass.

## Owner gates

No production deployment, real Cloud mutation, business DB mutation, old-repo mutation, or cutover without an explicit Owner GO.

No business database, ORM, migrations, seeds, or destructive data operations without an explicit Owner GO.

```text
PRODUCT_MODEL = SAAS_ONLY
PRIMARY_PRODUCT_DIRECTION = SAAS
PRIMARY_PRESENTATION = UI20
PRIMARY_ACCESS = BROWSER
PRIMARY_AUTH = EMAIL_PASSWORD
PRIMARY_SESSION = SERVER_SIDE_CLOUD_SESSION
PRIMARY_TENANCY = ORGANIZATION
PRIMARY_RUNTIME = CLOUD
PRIMARY_PRODUCTION_TOPOLOGY = SAME_ORIGIN_HTTPS
ONE_WORKOS_CODEBASE = YES
ONE_BUSINESS_ENGINE = YES
ONE_PRODUCT_TRUTH = YES
NO_CLIENT_CODE_FORK = YES
ALTERNATIVE_PRODUCT_DELIVERY = NO
PRIMARY_USER_JOURNEY = COMPLETE
PRIMARY_USER_JOURNEY_PROOF = SYNTHETIC_SAAS_E2E
NEXT_PROGRAM_PRIORITY = WORKOS_CONFIGURATION_FIRST_FOUNDATION_V1
NEXT_PROGRAM_STATUS = CF1_COMPLETE
CF1_COMMERCIAL_VERTICAL_V1 = COMPLETE
OWNER_ACCEPTED_IMPLEMENTATION = YES
NEXT_WAVE_AUTHORIZED = NO
REAL_CLOUD_WRITE = HOLD
REAL_DB_WRITE = HOLD
REAL_HUB_MEDIA_CLOUD_ROOT_ACCESS = HOLD
```

Living program authority: `docs/ROADMAP.md`.
Configuration-First architecture: `docs/architecture/WORKOS_CONFIGURATION_FIRST_CANON.md`.

```text
NO_SILENT_BUSINESS_TRUTH = CANONICAL
CHANGEABLE_BUSINESS_VALUES_IN_SOURCE = MIGRATION_TARGET
CONFIGURATION_FIRST_IMPLEMENTATION = CF1_COMMERCIAL_VERTICAL_V1_COMPLETE
```
