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

## Visual / UI canon

Future UI/UX work follows:

```text
VISUAL_LANGUAGE_CANON = docs/architecture/WORKOS_VISUAL_LANGUAGE_CANON_V1.md
UI_STYLE_ARCHITECTURE_CANON = docs/architecture/WORKOS_UI_STYLE_ARCHITECTURE_V1.md
VISUAL_IDENTITY = INDUSTRIAL_HARDWARE_FUTURE_INTELLIGENCE
```

Core presentation rules:
- real industrial context first; future intelligence through capability, orchestration, instrumentation, and control;
- no generic SaaS dashboard, card soup, decorative cyberpunk, or gratuitous gradients;
- dark and light are the same product character, with calibrated theme contrast;
- narrower screens progressively remove secondary detail before shrinking primary function into illegibility;
- operator task stays primary; visual spectacle must never hide the job to be done;
- no new major surface should add bulk to `src/styles/ui.css`; new surfaces use explicit modular stylesheet ownership;
- do not introduce a replacement component library or styling framework without explicit Owner GO.

## Current flow and status

- Active responsibilities: `docs/architecture/REQUEST_CATALOG_CONFIGURATION_CANON.md`.
- Living implementation status and accepted history: `docs/ROADMAP.md`.
- Configuration-First architecture: `docs/architecture/WORKOS_CONFIGURATION_FIRST_CANON.md`.
- Catalog administers reusable product definitions; it does not require or create a customer/request.
- New request owns client/CUI intake, an enabled-product choice or `Momentan indecis`.
- Configurator owns instance facts and commercial preparation inside a request. It renders the server schema.
- Manufactured ACM support is a product/assembly member. A supplied site support is HostContext.
- Keep one active implementation and one canon per responsibility. Preserve frozen domain contract versions and historical reports as history; do not treat their old `CURRENT_PROGRAM`/GO flags as current authority.
- Do not claim full product-definition authoring, production readiness or visual acceptance when only a projection/candidate is delivered.

## Verification and integration

Use meaningful targeted tests first. For cross-surface changes, run frontend typecheck/lint/tests/build and engine typecheck/lint plus relevant domain/API tests. Material UI changes require browser inspection at relevant widths, including 768px, and clear synthetic-vs-real evidence.

`pnpm lint` covers the root frontend; `pnpm engine:lint` covers the API and domain. Do not weaken either to make a candidate pass.

One implementation writer per mutable scope. Keep source work on a scoped branch; integrate only to the level authorized in the session. Review the final diff and repository identity before commit/push. Tests or self-review do not authorize merge/deploy.

## Data and Owner gates

No production deployment, real Cloud access/write, business DB mutation, old-repo mutation or cutover without explicit Owner authorization.

No business database, ORM, migrations, seeds or destructive data operations without explicit Owner authorization. Existing automated tests use isolated synthetic databases; they do not authorize applying migrations/seeds to an Owner reference runtime or real business root.

Do not stop, reclaim ports, reset or repurpose the Owner reference runtime for proof. Real data must remain outside Git. Report exact candidate checks and unresolved limits; do not copy old acceptance as new proof.
