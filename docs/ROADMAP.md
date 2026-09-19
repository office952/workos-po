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
ENGINE_CONSOLIDATION_V1 = COMPLETE_PENDING_MAIN_INTEGRATION

NEXT_PROGRAM_PRIORITY = WORKOS_PO_CLOUD_RUNTIME_AND_RECOVERY_V1
NEXT_PROGRAM_STATUS = NOT_STARTED

REAL_CLOUD_WRITE = HOLD
REAL_DB_WRITE = HOLD
DEPLOY = HOLD
CUTOVER = HOLD
FIRST_REAL_BUSINESS_OPERATION = HOLD
```

Do not start `WORKOS_PO_CLOUD_RUNTIME_AND_RECOVERY_V1` until a later explicit Owner GO.

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
ENGINE_LINT_COVERAGE = REQUIRED_BEFORE_OR_WITH_FIRST_WORKOS_PO_ENGINE_MODIFICATION
```

Do not invent a lint migration until the first authorized engine change.

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

These remain open product-contract items. Do not mark them fixed. Do not work around them in the UI.

```text
QUOTE_SNAPSHOT_CUSTOMER_REQUEST
JOB_TO_ATELIER_JOB_CONTEXT
CONFIGURATOR_FREEZE_RUNTIME

UI20_ACCEPTANCE_BLOCKER = NO
PRODUCT_FOLLOW_UP = YES
```
