# WorkOS PO roadmap

Living program authority for `office952/workos-po`.

This file is not a worklog and not an implementation plan.

```text
CANONICAL_PRODUCT_REPOSITORY = office952/workos-po
NO PARTIAL PRODUCTION CUTOVER
NO PARALLEL PRODUCT TRUTH
```

## Current

```text
FRONTEND_PRESERVATION_SEED = COMPLETE
ENGINE_CONSOLIDATION_V1 = COMPLETE
AUTHORITY_HANDOFF = COMPLETE
INTEGRATED_ON_MAIN = YES

WORKOS_PO_CLOUD_RUNTIME_AND_RECOVERY_V1 = COMPLETE
BACKUP_MODE = QUIESCED_OFFLINE_V1
CLOUD_RUNTIME_RECOVERY_SYNTHETIC_PROOF = COMPLETE

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
PRIMARY_USER_JOURNEY_PROOF_DATE = 2026-09-20

NEXT_PROGRAM_PRIORITY = WORKOS_CONFIGURATION_FIRST_FOUNDATION_V1
NEXT_PROGRAM_STATUS = CF1_COMPLETE
NEXT_PROGRAM_STARTED = YES
CONFIGURATION_FIRST_CANON = docs/architecture/WORKOS_CONFIGURATION_FIRST_CANON.md
CONFIGURATION_FIRST_IMPLEMENTATION = CF1_COMMERCIAL_VERTICAL_V1_COMPLETE
CF1_COMMERCIAL_VERTICAL_V1 = COMPLETE
OWNER_ACCEPTED_IMPLEMENTATION = YES
INTEGRATED_ON_MAIN = YES
MERGE = COMPLETE
MERGE_COMMIT = ec899ba294f37e614617256260727bd9eb61d6e3
PR_8 = MERGED
CF2_CF3_TECHNICAL_CONFIGURATION_V1 = IMPLEMENTED_IN_REVIEW
CF2 = IMPLEMENTED_IN_REVIEW
CF3 = IMPLEMENTED_IN_REVIEW
CF4 = NOT_STARTED
CF5 = NOT_STARTED
NEXT_WAVE_AUTHORIZED = NO
FORMULA_CONFIGURABILITY_FULLY_DELIVERED = NO

REAL_CLOUD_WRITE = HOLD
REAL_DB_WRITE = HOLD
DEPLOY = HOLD
CUTOVER = HOLD
FIRST_REAL_BUSINESS_OPERATION = HOLD
REAL_HUB_MEDIA_CLOUD_ROOT_ACCESS = HOLD
```

`WORKOS_PO_CLOUD_RUNTIME_AND_RECOVERY_V1` is complete as isolated synthetic proof. It did not access or cut over the real HUB MEDIA Cloud root. See `docs/PRODUCTION_RUNTIME.md`.

Normal WorkOS product startup is SaaS/Cloud-only and fail-closed. `WORKOS_LOCAL_ROOT` is not a product mode. Explicit single-plane helpers remain for isolated tests only. Local loopback runtimes and synthetic Cloud roots are engineering infrastructure, not a customer product variant.

```text
ONE WORKOS CODEBASE
PRODUCT_MODEL = SAAS_ONLY
PRIMARY_PRODUCT_DIRECTION = SAAS
PRIMARY_PRESENTATION = UI20
PRIMARY_ACCESS = BROWSER
PRIMARY_AUTH = EMAIL_PASSWORD
PRIMARY_SESSION = SERVER_SIDE_CLOUD_SESSION
PRIMARY_TENANCY = ORGANIZATION
PRIMARY_RUNTIME = CLOUD
PRIMARY_PRODUCTION_TOPOLOGY = SAME_ORIGIN_HTTPS
ALTERNATIVE_PRODUCT_DELIVERY = NO
SEPARATE_LOCAL_PRODUCT_CODE = NO
SEPARATE_CLOUD_PRODUCT_CODE = NO
CLIENT_SPECIFIC_FORKS = NO
ORGANIZATION_TENANCY = PRESERVED
HUB_MEDIA = VALIDATION_ORGANIZATION_NOT_CODE_FORK
NORMAL_CUSTOMER_REQUIRES_CURSOR = NO
NORMAL_CUSTOMER_REQUIRES_SOURCE_ACCESS = NO
NORMAL_CUSTOMER_REQUIRES_DIRECT_SQLITE_EDIT = NO
```

Shared: frontend, API, domain, business logic, migrations, Product Truth.

The living product journey remains:

```text
AUTH → CLIENT → CERERE → CONFIGURATOR → OFERTA → ACCEPTANCE → LUCRARE → PRODUCTION RELEASE → ATELIER → EXECUTION → COMPLETE → PLANNED VS ACTUAL
```

```text
ADMIN_TOOLING_DEBT = RECORDED_NOT_IMPLEMENTED
```

Recorded, not implemented: self-service signup, email verification, password recovery, MFA, billing/subscriptions, production organization provisioning UX, commercial onboarding automation, general People administration UX, general Machine/workcenter administration UX. Do not build these without a later Owner GO. Synthetic E2E may use existing owner APIs and the organization-provider CLI as explicit prerequisites. That does not make general admin tooling complete.

## Authority after engine consolidation

```text
PRESENTATION_AUTHORITY = workos-po root frontend
BUSINESS_ENGINE_AUTHORITY = workos-po/apps/api + workos-po/packages/domain
PERSISTENCE_IMPLEMENTATION_AUTHORITY = workos-po/apps/api
REAL_BUSINESS_DATA = external persistent WorkOS data root / Operational Planes
```

Source code lives in this repository. Real business data must not live in Git. `WORKOS_CLOUD_ROOT` remains external persistent storage. Copying the engine did not copy or migrate real customer data.

`office952/workos-final` and `office952/workos-ui20` are historical provenance. They are not continuing development authorities.

## Tooling advisory

```text
ENGINE_LINT_COVERAGE = REQUIRED
```

Engine lint is active for `apps/api` and `packages/domain`. Root `pnpm lint` remains frontend-only.

## Historical UI20 presentation phases

These phases record the accepted presentation program. They are not the living product-program stop.

| Phase | Scope | Status |
| --- | --- | --- |
| PHASE 0 | Repository isolation bootstrap | COMPLETE |
| PHASE 1 | API boundary audit | COMPLETE |
| PHASE 2 | WorkOS UI20 Foundation implementation | OWNER_ACCEPTED |
| PHASE 3 | Golden Spine / integrated presentation implementation | OWNER_ACCEPTED |
| PHASE 4 | Owner runtime + visual review | COMPLETE / OWNER_ACCEPTED |
| PHASE 5 | Coverage expansion | SUPERSEDED_AS_LIVING_STOP |
| PHASE 6 | Cutover planning | SUPERSEDED_AS_LIVING_STOP |

```text
OWNER_ACCEPTED_FOUNDATION = YES
OWNER_ACCEPTED_REFERENCE_SLICE = YES
OWNER_ACCEPTED_GOLDEN_SPINE = YES
OWNER_ACCEPTED_HIGH_FIDELITY_FIGMA_V1 = YES
OWNER_ACCEPTED_IMPLEMENTATION = YES
OWNER_ACCEPTED_IMPLEMENTATION_HEAD = fcd84c9c1ed6e4a5e55f66a466592fde919d0e00
OWNER_ACCEPTED_IMPLEMENTATION_DATE = 2026-09-17
TRANSPORT_CONTRACT_ID = workos-ui-contract-v1
```

Owner acceptance of UI20 covers Foundation, Reference Slice, Golden Spine, UI/UX Final Closure, Cloud Auth + organization/user shell, the final auth visual correction, and Owner runtime / visual review.

`docs/GOLDEN_SPINE_COMPLETION_V1.md` is a historical UI20 execution artifact. It is not living repository or engine authority.

## Accepted UX advisories

These remain accepted V1 presentation facts. Do not reopen them without a later Owner GO.

```text
LOGIN_GATE = INTENTIONALLY_MINIMAL
ACCOUNT_CLUSTER_1920 = RIGHT_EDGE_ANCHORED
EMAIL_768 = MAY_ELLIPSIZE_AS_SECONDARY_METADATA
```

## Known product follow-up

Investigated and runtime-proven on isolated synthetic SaaS (same Client Nord / Cerere litere Nord / LETTERS / NORD job). Do not work around engine truth in the UI.

```text
QUOTE_SNAPSHOT_CUSTOMER_REQUEST = FIXED
JOB_TO_ATELIER_JOB_CONTEXT = FIXED
CONFIGURATOR_FREEZE_RUNTIME = FIXED

UI20_ACCEPTANCE_BLOCKER = NO
PRODUCT_FOLLOW_UP = NO
```

`QUOTE_SNAPSHOT_CUSTOMER_REQUEST`: scoped quote GET now carries the customer snapshot plus the request sibling from commercial-request links. Frozen quote UI showed Client Nord and Deschide cererea.

`JOB_TO_ATELIER_JOB_CONTEXT`: inbox/plan carry `jobId`; job opens `/atelier?job=`; execution honors `?task=` / `?job=` and advances off a completed task query. Atelier listed the same NORD plan (12 tasks).

`CONFIGURATOR_FREEZE_RUNTIME`: owner seller setup is in the configurator; freeze surfaces API reasons. The historical synthetic proof happened to freeze after owner-confirmed cost evidence (existing EIC, supported owner resource PATCH — not a schema change). That was the old proof state, not the current product requirement: numeric `NEEDS_VERIFICATION` evidence may participate in calculations.

```text
COST_CALCULABILITY != COST_VERIFICATION
NUMERIC_CONFIRMED = CALCULABLE
NUMERIC_NEEDS_VERIFICATION = CALCULABLE
NUMERIC_NEEDS_VERIFICATION = NON_BLOCKING
NUMERIC_NEEDS_VERIFICATION = VISIBLE_WARNING
MISSING_NUMERIC_VALUE = NO_ZERO
MISSING_NUMERIC_VALUE = NO_INVENTION
MISSING_NUMERIC_VALUE = BLOCK_DEPENDENT_CALCULATION_ONLY
```

Owner confirmation is not required merely for a calculation to run or for calculated pricing to be available. Operator skills and machines are explicit organization truth: they are not invented in Atelier or Execution. The journey consumes configured providers and explains a missing machine. General People/Machine administration remains recorded admin debt.

## Configuration-First Foundation V1

Primary User Journey is complete. The living next program is Configuration-First: changeable business values must not permanently require source-code edits, and they must not remain silent in source.

Architecture ownership: `docs/architecture/WORKOS_CONFIGURATION_FIRST_CANON.md`.

```text
WORKOS = CONFIGURATION-FIRST BUSINESS ENGINE
NO_SILENT_BUSINESS_TRUTH = CANONICAL
CHANGEABLE_BUSINESS_VALUES_IN_SOURCE = MIGRATION_TARGET_NOT_DESIRED_END_STATE
GENERIC_MEGA_SETTINGS_BLOB = REJECTED
UNBOUNDED_NO_CODE_ERP_BUILDER = NO
NO_UNIVERSAL_SCOPE_PRECEDENCE = YES
HISTORICAL_REWRITE = NO
CUSTOMER_WITHOUT_CURSOR = REQUIRED
IMPLEMENTATION_AUTHORIZED = CF1_COMMERCIAL_VERTICAL_V1_COMPLETE
DB_IMPLEMENTATION_AUTHORIZED = COMMERCIAL_POLICY_VERSIONS_AND_TECHNICAL_SETTING_VERSIONS
OWNER_ACCEPTED_IMPLEMENTATION = YES
CF2_CF3_TECHNICAL_CONFIGURATION_V1 = IMPLEMENTED_IN_REVIEW
NEXT_WAVE_AUTHORIZED = NO
```

| Wave | Scope | Status | Authorization |
| --- | --- | --- | --- |
| CF0 | Configuration-First canon / documentation | COMPLETE | documentation wave |
| CF1 | CF1_COMMERCIAL_VERTICAL_V1: organization commercial defaults, quote-specific commercial terms, explicit pricing method, one additive `commercial_policy_versions` table, narrow resolver, `/admin/commercial`, engine consumption, snapshot provenance, manual product pricing | COMPLETE | Owner-accepted and merged on main (`ec899ba`, PR #8) |
| CF2 | Narrow technical resolver / audit / snapshot provenance for three LIGHTING_FRONT_LED settings | IMPLEMENTED_IN_REVIEW | Owner GO issued; not Owner-accepted or merged |
| CF3 | `/admin/technical` for the same three LIGHTING_FRONT_LED settings | IMPLEMENTED_IN_REVIEW | Owner GO issued; not Owner-accepted or merged |
| CF4 | Safe configurable formula foundation + administration | NOT_STARTED | later Owner GO |
| CF5 | Migrate remaining source-held technical settings / business values | NOT_STARTED | later Owner GO |

```text
ORGANIZATION_COMMERCIAL_POLICY = DEFAULTS
QUOTE_COMMERCIAL_TERMS = JOB_INPUT
NEGOTIATED_QUOTE_OVERRIDE = SUPPORTED
MANUAL_FIXED_PRODUCT = SUPPORTED
CUSTOMER_COMMERCIAL_DEFAULT = FUTURE_OPTIONAL_LAYER
ADMIN_CONFIGURATION_NAVIGATION = one L1 Administration entry + domain-owned L2
ORGANIZATION_COMMERCIAL_DEFAULT → QUOTE DRAFT TERMS → FROZEN QUOTE
NEGOTIATION_AFTER_FREEZE → NEW QUOTE REVISION
FROZEN_QUOTE_MUTATION = NO
ACCEPTANCE_TARGETS_EXACT_SNAPSHOT = YES
```

CF1 was previously recorded as `IMPLEMENTED_IN_REVIEW` while on the review branch. That marker was branch-local evidence, not Owner acceptance. Owner acceptance and merge are now complete.

CF2+CF3 technical configuration V1 is `IMPLEMENTED_IN_REVIEW` on this branch: organization-local versions for `ledPitchMm`, `ledModulePowerW`, and `psuReservePercent` only. It is not Owner-accepted and not merged. CF4, broad CF5, and remaining technical values are not started.

CF1 does not migrate technical settings. CF2+CF3 in review migrates only the three LIGHTING_FRONT_LED settings. Neither wave implements a formula engine or authorizes real Cloud/DB access.

After CF5, resume:

- Letters Product Truth
- ACM Product Truth
- member DAG corrections
- Letters + ACM composition
- execution expansion
- planning / capacity
