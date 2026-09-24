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

PEOPLE_AND_MACHINE_ADMIN_V1 = COMPLETE
EXECUTION_EXPANSION_V1_IMPLEMENTATION = COMPLETE / INTEGRATED
EXECUTION_EXPANSION_V1_OWNER_ACCEPTED = YES
EXECUTION_EXPANSION_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
EXE1_EXECUTION_READINESS = COMPLETE
EXE1_INTEGRATED_ON_MAIN = YES
EXE1_MERGE_COMMIT = 18d5506f062ad0725f0fa3a8b204e5b121bd45b1
PR_25 = MERGED
EXE2_PROVIDER_OPERATOR_INTERACTION = COMPLETE
EXE2_INTEGRATED_ON_MAIN = YES
EXE2_MERGE_COMMIT = 0919f217dfb0efe1600fde659f8cad66c252b88a
PR_26 = MERGED
EXE3_WHOLE_PLAN_COMPREHENSION = COMPLETE
EXE3_INTEGRATED_ON_MAIN = YES
EXE3_MERGE_COMMIT = 54d91e11d06b4deb567f601118147182c863dbf5
PR_27 = MERGED
EXE4 = COMPLETE / MERGED
EXE4_INTEGRATED_ON_MAIN = YES
EXE4_MERGE_COMMIT = e0ddbdac7de5896d683e05782a21f0e55a984b9b
PR_28 = MERGED
CURRENT_PROGRAM = EXECUTION_REALITY_V1
CURRENT_PROGRAM_STATUS = IMPLEMENTED_IN_REVIEW
PREVIOUS_CAP0 = SUPERSEDED_IN_PART_BY_OWNER_WORKLOAD_CORRECTION
PLANNING_CAPACITY_V1_PREFLIGHT = COMPLETE
PLANNING_CAPACITY_V1_OWNER_DECISIONS = SUPERSEDED_IN_PART
CAP0 = SUPERSEDED_IN_PART
CAP0_MERGE_COMMIT = a841399eda433fba4d7b95b5824fe1ffdd88fbed
CAP1 = SUPERSEDED_BY_PLN1
CAP2 = CANCELLED
CAP3 = SUPERSEDED_BY_PLN1_PROJECTION
PLN0 = COMPLETE
PLN1 = COMPLETE / OWNER_ACCEPTED
PLN2 = COMPLETE / OWNER_ACCEPTED
OPERATIONS_CONTROL_V1 = COMPLETE / OWNER_ACCEPTED
PRODUCT_ASSEMBLY_FIRST_CLASS_JOB = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_OPERATIONS_CONTROL_V1 = YES
OPERATIONS_CONTROL_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
PLN3 = NOT_STARTED
EXECUTION_REALITY_V1 = IMPLEMENTED_IN_REVIEW
OWNER_ACCEPTED_EXECUTION_REALITY_V1 = NO
ACTUAL_DURATION_V1 = IMPLEMENTED_IN_REVIEW
MACHINE_RUN_V1 = IMPLEMENTED_IN_REVIEW
PLANNED_VS_ACTUAL_TIME_V1 = IMPLEMENTED_IN_REVIEW
PLANNING_IMPLEMENTATION = OWNER_ACCEPTED
OWNER_ACCEPTED_PLANNING_IMPLEMENTATION = YES
PLN1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
CAPACITY_IMPLEMENTATION = CANCELLED_WEEKLY_SUPPLY
SCHEDULING = NOT_STARTED / OUT_OF_SCOPE_V1
MEMBER_DAG_COMPOSITION_CORRECTIONS = DEFERRED / NOT_CAPACITY_BLOCKER
PLANNING_CAPACITY_CANON = docs/architecture/PLANNING_CAPACITY_V1_CANON.md
CONFIGURATION_FIRST_CANON = docs/architecture/WORKOS_CONFIGURATION_FIRST_CANON.md
PRODUCT_ASSEMBLY_CONTRACT_V1 = OWNER_ACCEPTED_DIRECTION
PRODUCT_ASSEMBLY_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_PRODUCT_ASSEMBLY_V1 = YES
PRODUCT_ASSEMBLY_IMPLEMENTATION = COMPLETE / INTEGRATED
PRODUCT_ASSEMBLY_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
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
LOGO_DEFAULT_ENABLEMENT = DISABLED
PRODUCT_ASSEMBLY_CANON = docs/architecture/WORKOS_PRODUCT_ASSEMBLY_CONTRACT_V1.md
CONFIGURATION_FIRST_IMPLEMENTATION = CF1_COMPLETE_AND_CF2_CF3_COMPLETE_AND_CF4_COMPLETE
CF1_COMMERCIAL_VERTICAL_V1 = COMPLETE
CF1_OWNER_ACCEPTED_IMPLEMENTATION = YES
CF1_INTEGRATED_ON_MAIN = YES
CF1_MERGE = COMPLETE
MERGE_COMMIT = ec899ba294f37e614617256260727bd9eb61d6e3
PR_8 = MERGED
CF2_CF3_TECHNICAL_CONFIGURATION_V1 = COMPLETE
CF2 = COMPLETE
CF3 = COMPLETE
CF2_CF3_OWNER_ACCEPTED_IMPLEMENTATION = YES
CF2_CF3_INTEGRATED_ON_MAIN = YES
CF2_CF3_MERGE = COMPLETE
CF2_CF3_MERGE_COMMIT = 8e573617d0db8378961cce3dc6b3cbb74691511a
PR_10 = MERGED
CF4 = COMPLETE
CF4_NARROW_CONFIGURABLE_FORMULA_FOUNDATION_V1 = COMPLETE
CF4_OWNER_ACCEPTED_IMPLEMENTATION = YES
CF4_INTEGRATED_ON_MAIN = YES
CF4_MERGE = COMPLETE
CF4_MERGE_COMMIT = 1c91f9fd7f7d57bc91b16d1baed90eabee4581bb
PR_12 = MERGED
CF5 = NOT_STARTED
STANDALONE_CF5_REQUIRED_BEFORE_LETTERS = NO
REMAINING_CONFIGURATION_FIRST_WORK = DOMAIN_BY_DOMAIN_WHEN_REQUIRED
LETTERS_PRODUCT_TRUTH_V1 = COMPLETE
LETTERS_PRODUCT_TRUTH_V1_OWNER_ACCEPTED_IMPLEMENTATION = YES
LETTERS_PRODUCT_TRUTH_V1_INTEGRATED_ON_MAIN = YES
LETTERS_PRODUCT_TRUTH_V1_MERGE = COMPLETE
LETTERS_PRODUCT_TRUTH_V1_MERGE_COMMIT = bb3c80b7f500b8b71c15106140ca55af1faf70d9
PR_15 = MERGED
ACM_PRODUCT_TRUTH_V1 = COMPLETE
ACM_PRODUCT_TRUTH_V1_OWNER_ACCEPTED_IMPLEMENTATION = YES
ACM_PRODUCT_TRUTH_V1_INTEGRATED_ON_MAIN = YES
ACM_PRODUCT_TRUTH_V1_MERGE = COMPLETE
ACM_PRODUCT_TRUTH_V1_MERGE_COMMIT = 1583c458fd4c6e3d06d48629b954afabcb23b149
PR_17 = MERGED
PRODUCT_ENABLEMENT_ADMIN_V1 = COMPLETE
PRODUCT_ENABLEMENT_ADMIN_V1_OWNER_ACCEPTED_IMPLEMENTATION = YES
PRODUCT_ENABLEMENT_ADMIN_V1_INTEGRATED_ON_MAIN = YES
PRODUCT_ENABLEMENT_ADMIN_V1_MERGE = COMPLETE
PRODUCT_ENABLEMENT_ADMIN_V1_MERGE_COMMIT = b082b1a8a9288aac59ae0d3a34915415500107e1
PR_19 = MERGED
PEOPLE_AND_MACHINE_ADMIN_V1 = COMPLETE
PEOPLE_AND_MACHINE_ADMIN_V1_INTEGRATED_ON_MAIN = YES
PEOPLE_ADMIN_V1 = COMPLETE
PEOPLE_ADMIN_V1_INTEGRATED_ON_MAIN = YES
PEOPLE_ADMIN_V1_MERGE_COMMIT = a82a8046c884a09c42944068e98616a9712dc630
PR_21 = MERGED
MACHINE_WORKCENTER_ADMIN_V1 = COMPLETE
MACHINE_WORKCENTER_ADMIN_V1_INTEGRATED_ON_MAIN = YES
MACHINE_WORKCENTER_ADMIN_V1_MERGE_COMMIT = 27fb3f3bd57423f72daffc6e4989ddc990bf8d29
PR_22 = MERGED
PEOPLE_ELIGIBILITY_CAPABILITY_COVERAGE_CLOSURE = COMPLETE
PEOPLE_ELIGIBILITY_CAPABILITY_COVERAGE_INTEGRATED_ON_MAIN = YES
PEOPLE_ELIGIBILITY_CAPABILITY_COVERAGE_MERGE_COMMIT = ab3313199b7d278d364f3497e4e2c918dbd6354d
PR_23 = MERGED
CURRENT_SUPPORTED_PRODUCT_UNMAPPED_PEOPLE_CAPABILITIES = []
PRODUCT_ENABLEMENT = ORGANIZATION_SCOPED
CONFIGURATION_SURFACE = /admin/products
CURRENT_TWO_PRODUCTS_DEFAULT = ENABLED
DEFAULT_DERIVED_FROM_ALL_REGISTRY_TEMPLATES = NO
FUTURE_UNCONFIGURED_PRODUCT = FAIL_CLOSED
HISTORICAL_LIFECYCLE = PRESERVED
ACM_PRODUCT_CODE = PRD-ACM-CASSETTE-NONE
ACM_TEMPLATE_VERSION = 2
CLIENT_PRODUCT_DEFINITION_AUTHORITY = REMOVED
VALUES_CRV1_AUTHORITY = REQUIRED
GENERIC_ACCEPTANCE_BOUNDARY = CLOSED
CURRENT_FIRST_LETTERS_SKU = PRD-LETTERS-FRONTLIT-PLEXI-AL06
CURRENT_SKU_MODEL = SPECIFIC_PRODUCT_TEMPLATE_SKU
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

Recorded, not implemented: self-service signup, email verification, password recovery, MFA, billing/subscriptions, production organization provisioning UX, commercial onboarding automation. People Admin V1 and Machine/Workcenter Admin V1 are complete. Do not build remaining admin debt without a later Owner GO.

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

Owner confirmation is not required merely for a calculation to run or for calculated pricing to be available. Operator skills and machines are explicit organization truth: they are not invented in Atelier or Execution. The journey consumes configured providers and People qualifications. People Admin V1 and Machine/Workcenter Admin V1 are complete.

## Configuration-First Foundation V1

Primary User Journey is complete. Configuration-First remains canonical: changeable business values must not permanently require source-code edits, and they must not remain silent in source. Not every source constant is organization configuration.

Architecture ownership: `docs/architecture/WORKOS_CONFIGURATION_FIRST_CANON.md`.

Product Enablement Admin V1 is complete after Owner acceptance and merge of PR #19. Letters Product Truth V1 and ACM Product Truth V1 remain complete. People and Machine Admin V1 is complete. Standalone CF5 is not required first. Remaining Configuration-First work is domain-by-domain when actual product work requires it. Execution Expansion V1 is Owner-accepted and integrated. Current program is Planning Workload V1. PLN1 is Owner-accepted. PLN2 and Operations Control V1 are Owner-accepted. PLN3 is not started. Next wave is unauthorized.

```text
WORKOS = CONFIGURATION-FIRST BUSINESS ENGINE
NO_SILENT_BUSINESS_TRUTH = CANONICAL
CHANGEABLE_BUSINESS_VALUES_IN_SOURCE = MIGRATION_TARGET_NOT_DESIRED_END_STATE
GENERIC_MEGA_SETTINGS_BLOB = REJECTED
UNBOUNDED_NO_CODE_ERP_BUILDER = NO
NO_UNIVERSAL_SCOPE_PRECEDENCE = YES
HISTORICAL_REWRITE = NO
CUSTOMER_WITHOUT_CURSOR = REQUIRED
IMPLEMENTATION_AUTHORIZED = CF1_COMPLETE_AND_CF2_CF3_COMPLETE_AND_CF4_COMPLETE
DB_IMPLEMENTATION_AUTHORIZED = COMMERCIAL_POLICY_VERSIONS_AND_TECHNICAL_SETTING_VERSIONS_AND_FORMULA_VERSIONS
CF1_OWNER_ACCEPTED_IMPLEMENTATION = YES
CF2_CF3_TECHNICAL_CONFIGURATION_V1 = COMPLETE
CF2_CF3_OWNER_ACCEPTED_IMPLEMENTATION = YES
CF2_CF3_INTEGRATED_ON_MAIN = YES
CF2_CF3_MERGE = COMPLETE
CF2_CF3_MERGE_COMMIT = 8e573617d0db8378961cce3dc6b3cbb74691511a
PR_10 = MERGED
NEXT_WAVE_AUTHORIZED = NO
```

| Wave | Scope | Status | Authorization |
| --- | --- | --- | --- |
| CF0 | Configuration-First canon / documentation | COMPLETE | documentation wave |
| CF1 | CF1_COMMERCIAL_VERTICAL_V1: organization commercial defaults, quote-specific commercial terms, explicit pricing method, one additive `commercial_policy_versions` table, narrow resolver, `/admin/commercial`, engine consumption, snapshot provenance, manual product pricing | COMPLETE | Owner-accepted and merged on main (`ec899ba`, PR #8) |
| CF2 | Narrow technical resolver / audit / snapshot provenance for three LIGHTING_FRONT_LED settings | COMPLETE | Owner-accepted and merged on main (`8e57361`, PR #10) |
| CF3 | `/admin/technical` for the same three LIGHTING_FRONT_LED settings | COMPLETE | Owner-accepted and merged on main (`8e57361`, PR #10) |
| CF4 | Narrow configurable formula foundation + `/admin/formulas` for three LIGHTING_FRONT_LED derived results | COMPLETE | Owner-accepted and merged on main (`1c91f9f`, PR #12) |
| CF5 | Remaining Configuration-First migrations, only as domain-owned work when later product work requires them. Not a standalone mandatory gate before Letters. | NOT_STARTED | later domain-owned Owner GO |

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

CF2+CF3 technical configuration V1 is complete: organization-local versions for `ledPitchMm`, `ledModulePowerW`, and `psuReservePercent` only. Owner acceptance and merge on main are complete (`8e57361`, PR #10).

CF4 narrow configurable formula foundation V1 is complete, Owner-accepted, and integrated on main through PR #12 / merge commit `1c91f9f`. It contains only the three LIGHTING_FRONT_LED derived formulas (`ledModuleQuantity`, `totalLedLoadW`, `requiredPsuCapacityW`), with one domain evaluator, typed structured AST, semantic save validation, organization-local versioning, migration `031_formula_versions.sql`, `/admin/formulas`, and frozen Quote → Order → Production formula provenance. `selectPsuUnits` remains code-owned. CF5 remains NOT_STARTED and is not a standalone mandatory gate before Letters.

CF1 does not migrate technical settings. CF2+CF3 migrates only the three LIGHTING_FRONT_LED settings. CF4 does not migrate PSU selection, ACM, Letters Product Truth, or remaining source-held values. Real Cloud/DB access remains unauthorized.

## Letters Product Truth V1

```text
LETTERS_PRODUCT_TRUTH_V1 = COMPLETE
OWNER_ACCEPTED_IMPLEMENTATION = YES
INTEGRATED_ON_MAIN = YES
PR_15 = MERGED
MERGE_COMMIT = bb3c80b7f500b8b71c15106140ca55af1faf70d9
CLIENT_PRODUCT_DEFINITION_AUTHORITY = REMOVED
VALUES_CRV1_AUTHORITY = REQUIRED
GENERIC_ACCEPTANCE_BOUNDARY = CLOSED
STANDALONE_CF5_REQUIRED_BEFORE_LETTERS = NO
REMAINING_CONFIGURATION_FIRST_WORK = DOMAIN_BY_DOMAIN_WHEN_REQUIRED
CURRENT_FIRST_LETTERS_SKU = PRD-LETTERS-FRONTLIT-PLEXI-AL06
MODEL = SPECIFIC_PRODUCT_TEMPLATE_SKU
CUSTOMER_OPERABLE_WITHOUT_CURSOR = YES_FOR_EXISTING_SKU
NO_CLIENT_CODE_FORK = YES
PRODUCT_ENABLEMENT = ORGANIZATION_SCOPED
NEXT_PROGRAM_PRIORITY = EXECUTION_EXPANSION_V1
NEXT_PROGRAM_STATUS = PREFLIGHT_REQUIRED
NEXT_WAVE_AUTHORIZED = NO
```

Accepted product mutation authority is server ProductTemplate + FormSchema + DraftValues + resolved organization technical settings + resolved organization formulas + crv1, reconstructed on the server. A client-submitted ProductDefinition is not accepted mutation authority. `/compile` remains a diagnostic/compile contract. Definition-only confirm, quote freeze, and accepted production fail closed.

Organizations can enable or disable shared ProductTemplates for new work through `/admin/products`.

Current first Letters SKU is a specific product template. Fixed construction remains product identity, not organization-wide technical settings:

```text
face.materialFamily = plexiglas
face.thicknessMm = 3
face.opticalType = opal
volume.materialFamily = aluminium
volume.thicknessMm = 0.6
back.materialFamily = forex
back.thicknessMm = 10
lighting.mode = front_lit
```

Current order/job options remain product option truth: volume depth 30 / 60 / 80 / 100 mm; face finish none / vinyl; volume finish none / vinyl / painted. Confirmed face area and confirmed perimeter remain job/operator inputs.

These values describe this current SKU. They are not universal HUB MEDIA platform law. A later Owner Product Truth decision may change this SKU or add another.

Different constructions such as other Plexiglas / aluminium / Forex thicknesses, halo or reverse illumination, or full aluminium should normally become additional product templates / SKUs / resource identities, not organization technical-setting overrides of this SKU. Do not implement those products now.

After CF4, preferred living sequence:

1. Letters Product Truth V1
2. domain-owned Configuration-First migrations only when required by actual product work
3. ACM Product Truth
4. People and Machine Admin V1
5. execution expansion
6. planning / workload

Letters Product Truth V1, ACM Product Truth V1, Product Enablement Admin V1, and People and Machine Admin V1 are complete. Execution Expansion V1 is Owner-accepted and integrated. Living program is Planning Workload V1. PLN1, PLN2, and Operations Control V1 are Owner-accepted. The previous CAP0 weekly-capacity contract is superseded in part. PLN0 is canon correction only. Weekly provider `availableMinutes` is cancelled. Member DAG / composition corrections remain deferred and are not a Planning blocker. CF5 remains NOT_STARTED and is not selected.

## ACM Product Truth V1

```text
ACM_PRODUCT_TRUTH_V1 = COMPLETE
OWNER_ACCEPTED_IMPLEMENTATION = YES
INTEGRATED_ON_MAIN = YES
PR_17 = MERGED
MERGE_COMMIT = 1583c458fd4c6e3d06d48629b954afabcb23b149
ACM_PRODUCT_CODE = PRD-ACM-CASSETTE-NONE
ACM_TEMPLATE_VERSION = 2
ACM_FORM_SCHEMA_VERSION = prd-acm-cassette-none-form-v2
MODEL = SPECIFIC_PRODUCT_TEMPLATE_SKU
DEPTH = FREE_NUMERIC_MM
SECOND_RETURN = OPTIONAL_NUMERIC_MM
FOLD_COUNT = REMOVED
MOUNTING_SYSTEM = REMOVED
FRAME_CLEARANCE = ORGANIZATION_CONFIGURABLE_VERSIONED
FRAME_CLEARANCE_DEFINITION_ID = STEEL_INTERNAL_FRAME.frameClearanceMm
FRAME_CLEARANCE_SCOPE = ORGANIZATION
FRAME_CLEARANCE_STARTER = 2 mm
PRODUCT_SCOPED_TECHNICAL_SETTING_RESOLUTION = YES
CLIENT_PRODUCT_DEFINITION_AUTHORITY = REMOVED
VALUES_CRV1_AUTHORITY = REQUIRED
GENERIC_ACCEPTANCE_BOUNDARY = CLOSED
CUSTOMER_OPERABLE_WITHOUT_CURSOR = YES_FOR_EXISTING_SKU
NO_CLIENT_CODE_FORK = YES
PRODUCT_ENABLEMENT = ORGANIZATION_SCOPED
DB_MIGRATION_REQUIRED = NO
NEXT_PROGRAM_PRIORITY = EXECUTION_EXPANSION_V1
NEXT_PROGRAM_STATUS = PREFLIGHT_REQUIRED
NEXT_WAVE_AUTHORIZED = NO
```

Current ACM SKU identity is a specific product template, not universal ACM law:

```text
face.materialFamily = acm
face.thicknessMm = 3
face.finish = none
back.materialFamily = steel
lighting = none
```

Current order/job geometry is numeric Product Truth: `face.widthMm`, `face.heightMm`, free positive `face.cassetteDepthMm` (prima întoarcere / adâncime / perete casetă), and optional `face.backReturnMm` (a doua întoarcere / buză spate). Missing or 0 backReturn means no second return. `root.mountingSystem` and `face.foldCount` are not current V2 Product Truth.

Developed blank is the current rectangular numeric basis, not nesting, DXF, SVG, CAM, or production-graphics parsing:

```text
blankWidth = width + 2 * (depth + backReturn)
blankHeight = height + 2 * (depth + backReturn)
```

Accepted proof: 3000 × 500, depth 80, backReturn 25 → blank 3210 × 710 → 2.2791 m².

Frame outer dimension = panel dimension − 2 × ACM thickness − organization `frameClearanceMm`. The 2 mm starter is organization-versioned technical-setting default, not immutable platform law. Owner may edit it on `/admin/technical`. Members are read-only. Later setting changes do not rewrite frozen snapshots.

Product-scoped technical-setting resolution: ACM requires `STEEL_INTERNAL_FRAME.frameClearanceMm`. Letters requires only its own lighting settings. An ACM clearance change invalidates ACM crv1 and does not invalidate a Letters crv1. Missing ACM clearance blocks ACM only. Starter upgrade is additive and idempotent. `ADOPT_EXISTING` does not silently seed ACM truth.

Accepted mutation authority remains server ProductTemplate + FormSchema + DraftValues + applicable organization technical settings + applicable formulas + crv1. Client ProductDefinition has zero authority.

Organizations can enable or disable shared ProductTemplates for new work through `/admin/products`. Do not treat Product Enablement as CF5 complete. Weekly capacity supply remains cancelled. Living program status is the Current program section.

## Product Assembly Contract V1

Cross-cutting architecture direction so Configurator design does not invent a mega-template or absorb ACM into Letters BACK. Narrow V1 is Owner-accepted and integrated. It is not the current program and it does not authorize the next wave.

```text
PRODUCT_ASSEMBLY_CONTRACT_V1 = OWNER_ACCEPTED_DIRECTION
PRODUCT_ASSEMBLY_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_PRODUCT_ASSEMBLY_V1 = YES
PRODUCT_ASSEMBLY_IMPLEMENTATION = COMPLETE / INTEGRATED
PRODUCT_ASSEMBLY_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
PRODUCT_ASSEMBLY_V1_INTEGRATED_COMMIT = 006e60b593a0f522d96b4bcc3c4b317e06a8f75d
PRODUCT_ASSEMBLY_CANON = docs/architecture/WORKOS_PRODUCT_ASSEMBLY_CONTRACT_V1.md
ASSEMBLY_KIND = SIGN_ASSEMBLY_ACM_LETTERS_V1
SUPPORT_PANEL = PRD-ACM-CASSETTE-NONE
SIGNAGE_LETTERS = PRD-LETTERS-FRONTLIT-PLEXI-AL06
RELATION = LETTERS_ON_ACM_PANEL
ONE_PRODUCT_TRUTH = YES
CHILD_PRODUCT_TRUTH = INDEPENDENT
NO_ABSORPTION = YES
TECHNICAL_COMPOSITION_COMMERCIAL_LINES_COUPLED = NO
```

Accepted V1 is ACM plus Letters: typed AssemblyDefinition, AssemblyTruth, AssemblyAggregate, `LETTERS_ON_ACM_PANEL`, a grouped assembly quote, an immutable order, production release, and one combined Execution Plan with mount, assembly QC, and final packing. PLN1 compatibility and organization enablement behavior remain. AssemblyTruth references child ProductTruth identity and hash, child ProductAggregate hash, member roles, and relations. AssemblyQuote owns child quote snapshot identity and commercial values. Repricing a child quote is not a technical Assembly change.

Volumetric Logo V1 and Product Assembly V2 are Owner-accepted. They do not replace V1 and they do not change the Planning program.

```text
VOLUMETRIC_LOGO_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_VOLUMETRIC_LOGO_V1 = YES
LOGO_PRODUCT = PRD-LOGO-FRONTLIT-PLEXI-AL06
LOGO_MODEL = ONE_HOMOGENEOUS_SET
LOGO_DEFAULT_ENABLEMENT = DISABLED
PRODUCT_ASSEMBLY_V2 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_PRODUCT_ASSEMBLY_V2 = YES
ASSEMBLY_V2_KIND = SIGN_ASSEMBLY_ACM_SIGNAGE_V2
ASSEMBLY_V2_CARDINALITY = 1 ACM + 1 Logo + optional 0..1 Letters
VOLUMETRIC_LOGO_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
PRODUCT_ASSEMBLY_V2_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
LEGACY_NAMING_DEBT = ProductAggregate.inscription is a generic display designation for some products
LEGACY_PROCESS_NAMING = some shared process IDs retain LETTER naming
LEGACY_DISPLAY_DESIGNATION = ProductAggregate.inscription also transports generic product designation
GLOBAL_MOBILE_NAV_CLIPPING = existing shell debt around narrow viewport
```

Logo V1 reuses the front-lit Letters fabrication stack as this SKU's identity: Plexiglas 3 mm opal, aluminium 0.6 mm, Forex 10 mm, front-lit LED, depths 30/60/80/100. Confirmed area and perimeter are operator totals for the whole set. There is no piece collection. Logo stays disabled until the organization enables it. Assembly V2 adds `LOGO_ON_ACM_PANEL` and, when Letters is present, a separate `MOUNT_LETTERS_ON_PANEL`. `MOUNT_LOGO_ON_PANEL` waits for the panel and the logo, not for Letters.

Still not implemented: ACM segmentation, generic graph editor, recursive assemblies, CAD positioning, mounting hardware BOM, PLN3, and Scheduling.

Product Assembly V1 acceptance advisories, not a correction wave:

- The accepted ACM + Letters sale is one first-class job on `/lucrari`. That row is Owner-accepted with Operations Control V1.
- repeated "Rezumat ansamblu" heading
- quote section order could be improved
- existing narrow navigation clipping
- execution metadata spacing / "Nealocat" density

Logo V1 and Assembly V2 acceptance advisories, not a correction wave:

- some shared process IDs retain LETTER naming
- `ProductAggregate.inscription` also transports a generic product designation; the Logo operator label remains Denumire logo
- existing shell navigation clipping on a narrow viewport

## Host Context, Mounting Interface, and Site Installation V1

Owner-accepted and integrated on main. This does not replace Planning Workload V1 and it does not authorize the next wave.

```text
HOST_CONTEXT_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_HOST_CONTEXT_V1 = YES
MOUNTING_INTERFACE_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_MOUNTING_INTERFACE_V1 = YES
SITE_INSTALLATION_VERTICAL_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_SITE_INSTALLATION_VERTICAL_V1 = YES
HOST_CONTEXT_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
MOUNTING_INTERFACE_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
SITE_INSTALLATION_VERTICAL_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
NEXT_WAVE_AUTHORIZED = NO
```

Host Context is the existing external site, facade, or customer support. It is not a ProductDefinition, ProductTruth, ProductAggregate, or commercial product line, and it must not be fabricated as a WorkOS product. Mutable authority is SiteInstallationFacts. Frozen authority is FrozenHostContextV1.

Mounting Interface is the technical connection between WorkOS work and that existing host, including V1 fixing semantics. Frozen authority is FrozenMountingInterfaceV1. It is not a product component, an assembly child, a commercial price, a hardware BOM, CAD placement, or structural engineering.

Site installation is an optional organization-configurable operational service. Provider modes are INTERNAL and SUBCONTRACTED. Organization modes remain SERVICE_DISABLED, INTERNAL, SUBCONTRACTED, and BOTH. The client price is MANUAL_FIXED_PER_REQUEST. Internal cost stays separate from that price. There is no automatic installation markup, no relation price, and no installation line on each assembly child.

Accepted lifecycle: Request, SiteInstallationFacts, provider mode, internal or subcontract cost evidence, manual client installation price, Quote, Acceptance, Order, Production Release, Execution, INSTALL_AT_SITE. Frozen downstream truth does not reread mutable request facts. ProductTruth and AssemblyTruth stay unaffected.

A standalone product with installation is the product plus one SITE_INSTALLATION service line. An assembly with installation keeps its child product sections plus exactly one SITE_INSTALLATION service line. Assembly execution remains fabrication, internal assembly mounting, assembly QC, pack, then INSTALL_AT_SITE. MOUNT_LETTERS_ON_PANEL and MOUNT_LOGO_ON_PANEL are not INSTALL_AT_SITE.

SERVICE_DISABLED leaves unrelated product and assembly work unchanged. INTERNAL and SUBCONTRACTED select that provider. BOTH requires an explicit provider-mode choice. A later organization configuration change does not rewrite frozen historical records.

```text
CUSTOMER_OPERABLE_WITHOUT_CURSOR = YES
NO_CLIENT_CODE_FORK = YES
INDEPENDENT_CODE_REVIEW = PASS
DETERMINISTIC_REGRESSION = PASS
VERIFY_ALL = PASS
SYNTHETIC_RUNTIME_PROOF = PASS
INDEPENDENT_VISUAL_REVIEW = PASS
P0 = 0
P1 = 0
UX-S0 = 0
UX-S1 = 0
REAL_DATA_USED = NO
```

Acceptance advisories, not a correction wave:

- UX-S2-01. Request / Montaj la locație is vertically long on desktop. Later global UI work may move it to the semantic two-column page model.
- UX-S2-02. Operational installation context at 390px is readable and has no horizontal overflow, and it remains visually dense in two columns. Later responsive work may stack it to one column.

Still out of scope: site electrical INCLUDED or SUBCONTRACTED pricing, mounting hardware BOM, transport and travel pricing, PLN3, Scheduling, CF5, CAD or site positioning, and crew Pontaj or GPS.

## Product Enablement Admin V1

```text
PRODUCT_ENABLEMENT_ADMIN_V1 = COMPLETE
OWNER_ACCEPTED_IMPLEMENTATION = YES
INTEGRATED_ON_MAIN = YES
PR_19 = MERGED
MERGE_COMMIT = b082b1a8a9288aac59ae0d3a34915415500107e1
PRODUCT_ENABLEMENT = ORGANIZATION_SCOPED
CONFIGURATION_SURFACE = /admin/products
AVAILABLE_MODES = ENABLED / DISABLED
OWNER_WRITE = YES
MEMBER_READ = YES
MEMBER_WRITE = NO
NEW_WORK_GATE = SERVER_AUTHORITATIVE
CURRENT_TWO_PRODUCTS_DEFAULT = ENABLED
DEFAULT_DERIVED_FROM_ALL_REGISTRY_TEMPLATES = NO
PLATFORM_DEFAULT_ENABLED_TEMPLATE_CODES_V1 = PRD-LETTERS-FRONTLIT-PLEXI-AL06; PRD-ACM-CASSETTE-NONE
FUTURE_UNCONFIGURED_PRODUCT = FAIL_CLOSED
PRODUCT_ENABLEMENT_SCOPE = NEW_WORK_ONLY
HISTORICAL_LIFECYCLE = PRESERVED
HISTORICAL_REWRITE = NO
MIGRATION = 032_organization_product_enablement_versions.sql
PRODUCT_ENABLEMENT_VERSIONED = YES
SAME_VALUE_SAVE = IDEMPOTENT
VERSION_INCREMENT = ON_CHANGE
ORG_ISOLATION = YES
PRODUCT_ENABLEMENT_IS_PRODUCT_TRUTH = NO
PRODUCT_TRUTH_CHANGED = NO
SNAPSHOT_SCHEMA_CHANGED = NO
CLIENT_PRODUCT_DEFINITION_AUTHORITY = REMOVED
VALUES_CRV1_AUTHORITY = REQUIRED
PRODUCT_ENABLEMENT_CONFIGURATION = DOMAIN_OWNED
CF5 = NOT_STARTED
CUSTOMER_OPERABLE_WITHOUT_CURSOR = YES
NO_CLIENT_CODE_FORK = YES
NEXT_PROGRAM_PRIORITY = EXECUTION_EXPANSION_V1
NEXT_PROGRAM_STATUS = PREFLIGHT_REQUIRED
NEXT_WAVE_AUTHORIZED = NO
```

Owner writes, member reads. ENABLED products appear for new work. DISABLED known products are hidden from the new-work catalog and refused by server Product routes with `product_not_enabled`. An unknown ProductTemplate remains `404`.

The current Letters and ACM templates remain available by an explicit V1 compatibility default. A future ProductTemplate does not become available merely because it exists in the shared registry. It must be explicitly enabled.

Disabling a product does not rewrite or block already-frozen Quote → Acceptance → Order → Production Release → Execution Plan → Execution records.

Product enablement is an organization-level new-work availability rule. It is not persisted inside ProductDefinition, ProductTruth, crv1, QuoteSnapshot, OrderSnapshot, or AcceptedProductionSnapshot. This capability does not complete CF5.

## People and Machine Admin V1

```text
PEOPLE_AND_MACHINE_ADMIN_V1 = COMPLETE
PEOPLE_AND_MACHINE_ADMIN_V1_INTEGRATED_ON_MAIN = YES
PEOPLE_ADMIN_V1 = COMPLETE
PEOPLE_ADMIN_V1_INTEGRATED_ON_MAIN = YES
PR_21 = MERGED
PEOPLE_ADMIN_FEATURE_HEAD = 92871d42896e37a7f068a89558927ef082f01ab2
PEOPLE_ADMIN_V1_MERGE_COMMIT = a82a8046c884a09c42944068e98616a9712dc630
PEOPLE_ADMIN_MERGED_AT = 2026-09-21T11:08:20Z
MACHINE_WORKCENTER_ADMIN_V1 = COMPLETE
MACHINE_WORKCENTER_ADMIN_V1_INTEGRATED_ON_MAIN = YES
PR_22 = MERGED
MACHINE_ADMIN_FEATURE_HEAD = 6f6794b69b2a1a9ed9c0ae0cd1583f0102678949
MACHINE_WORKCENTER_ADMIN_V1_MERGE_COMMIT = 27fb3f3bd57423f72daffc6e4989ddc990bf8d29
MACHINE_ADMIN_MERGED_AT = 2026-09-21T12:19:45Z
PEOPLE_ELIGIBILITY_CAPABILITY_COVERAGE_CLOSURE = COMPLETE
PEOPLE_ELIGIBILITY_CAPABILITY_COVERAGE_INTEGRATED_ON_MAIN = YES
PR_23 = MERGED
PEOPLE_COVERAGE_FEATURE_HEAD = 78ba693612a36a5ec3c8e3cbf8e4fa2699c572ce
PEOPLE_ELIGIBILITY_CAPABILITY_COVERAGE_MERGE_COMMIT = ab3313199b7d278d364f3497e4e2c918dbd6354d
PEOPLE_COVERAGE_MERGED_AT = 2026-09-21T12:49:26Z
CURRENT_SUPPORTED_PRODUCT_UNMAPPED_PEOPLE_CAPABILITIES = []
PROVIDER_ELIGIBILITY != EXECUTOR_ELIGIBILITY
NEXT_PROGRAM_PRIORITY = EXECUTION_EXPANSION_V1
NEXT_PROGRAM_STATUS = PREFLIGHT_REQUIRED
NEXT_PROGRAM_STARTED = NO
NEXT_WAVE_AUTHORIZED = NO
```

People Admin V1 lets an organization owner create people, assign and retire active skills, and read current eligibility. Machine/Workcenter Admin V1 lets an owner incrementally configure organization machines and workcenters. A provider capability never grants a Person qualification. A Person qualification never replaces a required provider.

Current supported-product People capability coverage after PR #23:

```text
CNC_ROUTING = MAPPED
PROFILE_FORMING = MAPPED
MANUAL_ASSEMBLY = MAPPED
VINYL_APPLICATION = MAPPED
ELECTRICAL_ASSEMBLY = MAPPED
PAINTING = MAPPED
QUALITY_CONTROL = MAPPED
PACKAGING = MAPPED
METAL_CUTTING = MAPPED
```

Locked current mappings for the three closed capabilities:

```text
VINYL_APPLICATION → SK_VINYL_APPLICATOR → Aplicare autocolant
PAINTING → SK_PAINTING → Vopsire spray / pistol
METAL_CUTTING → SK_METAL_CUTTING_OPERATOR → Operator debitare metale
```

These three mappings are current product/process truth, not universal HR policy. Unused future catalog capabilities may remain unmapped. Shared-foundation reconciliation is idempotent. Existing V1 marker is preserved and no longer blocks later shared-skill reconcile. `ADOPT_EXISTING` receives shared skill foundation only, not trusted workforce. Employee qualifications are not invented automatically.

## Previous program

```text
PREVIOUS_PROGRAM = EXECUTION_EXPANSION_V1
EXECUTION_EXPANSION_V1_IMPLEMENTATION = COMPLETE / INTEGRATED
EXECUTION_EXPANSION_V1_OWNER_ACCEPTED = YES
EXECUTION_EXPANSION_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
EXE1_EXECUTION_READINESS = COMPLETE / MERGED
EXE1_MERGE_COMMIT = 18d5506f062ad0725f0fa3a8b204e5b121bd45b1
PR_25 = MERGED
EXE2_PROVIDER_OPERATOR_INTERACTION = COMPLETE / MERGED
EXE2_MERGE_COMMIT = 0919f217dfb0efe1600fde659f8cad66c252b88a
PR_26 = MERGED
EXE3_WHOLE_PLAN_COMPREHENSION = COMPLETE / MERGED
EXE3_MERGE_COMMIT = 54d91e11d06b4deb567f601118147182c863dbf5
PR_27 = MERGED
EXE4 = COMPLETE / MERGED
EXE4_MERGE_COMMIT = e0ddbdac7de5896d683e05782a21f0e55a984b9b
PR_28 = MERGED
```

Execution Expansion V1 is Owner-accepted and integrated on main. EXE1 replaced hardcoded `executionReadiness = NOT_IMPLEMENTED` with topology-derived READY|BLOCKED. EXE2 made provider assignment explicit and projected Owner-only `canAssignProvider`. EXE3 made the whole plan comprehensible from existing server facts. EXE4 records operator actual consumption through the existing complete contract. Scheduling and MachineRun remain unimplemented.

Accepted execution contract, unchanged by this acceptance:

```text
CapabilityProvider != Person != Operator identity
Eligibility != Assignment
Assignment != Execution Reality
EXECUTION_ACTUAL_CONSUMPTION -> MAY_CREATE_INVENTORY_OUT
INVENTORY_GATES_TASK_START = NO
INVENTORY_GATES_TASK_COMPLETION = NO
FROZEN_PRODUCTION_SNAPSHOT = EXECUTION_SOURCE_TRUTH
LATER_PRODUCT_PRICING_CONFIGURATION_CHANGES_REWRITE_RELEASED_EXECUTION = NO
```

Execution acceptance advisories, not a correction wave:

- inventory may become negative from real actual consumption; that remains visible status, not an execution blocker
- composition READY|BLOCKED is not repeated verbatim on `/executie`; task-level block reasons are shown
- the execution task list can become visually dense
- Atelier empty-state wording contains minor implementation-oriented language

## Current program

```text
CURRENT_PROGRAM = EXECUTION_REALITY_V1
CURRENT_PROGRAM_STATUS = IMPLEMENTED_IN_REVIEW
PREVIOUS_CAP0 = SUPERSEDED_IN_PART_BY_OWNER_WORKLOAD_CORRECTION
PLANNING_CAPACITY_V1_PREFLIGHT = COMPLETE
PLANNING_CAPACITY_V1_OWNER_DECISIONS = SUPERSEDED_IN_PART
CAP0 = SUPERSEDED_IN_PART
CAP0_MERGE_COMMIT = a841399eda433fba4d7b95b5824fe1ffdd88fbed
CAP1 = SUPERSEDED_BY_PLN1
CAP2 = CANCELLED
CAP3 = SUPERSEDED_BY_PLN1_PROJECTION
PLN0 = COMPLETE
PLN1 = COMPLETE / OWNER_ACCEPTED
PLN2 = COMPLETE / OWNER_ACCEPTED
OPERATIONS_CONTROL_V1 = COMPLETE / OWNER_ACCEPTED
PRODUCT_ASSEMBLY_FIRST_CLASS_JOB = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_OPERATIONS_CONTROL_V1 = YES
OPERATIONS_CONTROL_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
PLN3 = NOT_STARTED
EXECUTION_REALITY_V1 = IMPLEMENTED_IN_REVIEW
OWNER_ACCEPTED_EXECUTION_REALITY_V1 = NO
ACTUAL_DURATION_V1 = IMPLEMENTED_IN_REVIEW
MACHINE_RUN_V1 = IMPLEMENTED_IN_REVIEW
PLANNED_VS_ACTUAL_TIME_V1 = IMPLEMENTED_IN_REVIEW
PLANNING_IMPLEMENTATION = OWNER_ACCEPTED
OWNER_ACCEPTED_PLANNING_IMPLEMENTATION = YES
PLN1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
CAPACITY_IMPLEMENTATION = CANCELLED_WEEKLY_SUPPLY
SCHEDULING = NOT_STARTED / OUT_OF_SCOPE_V1
MEMBER_DAG_COMPOSITION_CORRECTIONS = DEFERRED / NOT_CAPACITY_BLOCKER
HOST_CONTEXT_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_HOST_CONTEXT_V1 = YES
MOUNTING_INTERFACE_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_MOUNTING_INTERFACE_V1 = YES
SITE_INSTALLATION_VERTICAL_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_SITE_INSTALLATION_VERTICAL_V1 = YES
HOST_CONTEXT_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
MOUNTING_INTERFACE_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
SITE_INSTALLATION_VERTICAL_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
PLANNING_CAPACITY_CANON = docs/architecture/PLANNING_CAPACITY_V1_CANON.md
```

Execution Reality V1 is implemented and in review. It records optional task `actualDurationMinutes` and explicit MachineRun segments. It does not replace Planning. PLN0 workload-first canon is complete. PLN1 is Owner-accepted: `plannedEffortMinutes`, derived provider workload, `/planificare`, and the synthetic Owner reference runtime at `http://127.0.0.1:8787`. `planningWeek` and weekly `availableMinutes` remain cancelled. PLN2 and Operations Control V1 are Owner-accepted. PLN3 is not started. Scheduling is out of V1. Member DAG / composition corrections remain deferred and are not a Planning blocker. Host Context V1, Mounting Interface V1, and the site-installation vertical are Owner-accepted. Execution Reality is not Owner-accepted. Next wave is unauthorized.

PLN1 acceptance advisories, not a correction wave:

- unassigned task effort editing — closed and Owner-accepted with Operations Control V1
- duplicate-looking planning rows / task differentiation
- empty-state density
- narrow mobile navigation clipping
- minor PLN1 test/doc cleanup

Operations Control V1 and PLN2 acceptance advisories, not a correction wave:

- Assembly Job Detail title may show joined inscriptions, such as `PANOU ACM · NORD`. The preferred later title is `Panou ACM + litere volumetrice`, with inscriptions as secondary context.
- Overdue comparison uses the UTC calendar day. Organization-local midnight can differ. `OPERATIONAL_DATE_TIMEZONE_SEMANTICS = FOLLOW_UP_REQUIRED_BEFORE_ADVANCED_CALENDAR_AUTOMATION`. Do not add timezone or calendar infrastructure for this residual.
- `Alocă furnizorul în execuție` uses a separate planning row. Density can improve later.
- Narrow mobile navigation clipping around 390px predates this wave.
