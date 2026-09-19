# Presentation roadmap

This roadmap is presentation-only. It does not duplicate the WorkOS product roadmap.

```text
NO PARTIAL PRODUCTION CUTOVER
```

## Phases

| Phase | Scope | Status |
| --- | --- | --- |
| PHASE 0 | Repository isolation bootstrap | COMPLETE |
| PHASE 1 | API boundary audit | COMPLETE |
| PHASE 2 | WorkOS UI20 Foundation implementation | OWNER_ACCEPTED |
| PHASE 3 | Golden Spine / integrated presentation implementation | OWNER_ACCEPTED |
| PHASE 4 | Owner runtime + visual review | COMPLETE / OWNER_ACCEPTED |
| PHASE 5 | Coverage expansion | NOT_STARTED |
| PHASE 6 | Cutover planning | NOT_STARTED |

## Current

```text
PHASE_0 = COMPLETE
PHASE_1 = COMPLETE
TRANSPORT_CONTRACT_GAP_CLOSURE_V1 = INTEGRATED_ON_WORKOS_FINAL_MAIN
TRANSPORT_CONTRACT_ID = workos-ui-contract-v1
WORKOS_FINAL_TRANSPORT_MAIN = 1f409ab728668d2daace37273055177075fecd7c
PHASE_2 = OWNER_ACCEPTED
PHASE_3 = OWNER_ACCEPTED
PHASE_4 = OWNER_ACCEPTED
PHASE_5 = NOT_STARTED
PHASE_6 = NOT_STARTED
OWNER_ACCEPTED_FOUNDATION = YES
OWNER_ACCEPTED_REFERENCE_SLICE = YES
OWNER_ACCEPTED_GOLDEN_SPINE = YES
OWNER_ACCEPTED_HIGH_FIDELITY_FIGMA_V1 = YES
OWNER_ACCEPTED_IMPLEMENTATION = YES
INTEGRATED_ON_MAIN = NO
NEXT_HORIZONTAL_EXPANSION_STARTED = NO
CUTOVER_STARTED = NO
```

## Accepted implementation

```text
OWNER_DECISION = accept implementarea
OWNER_ACCEPTED_IMPLEMENTATION = YES
OWNER_ACCEPTED_IMPLEMENTATION_HEAD = fcd84c9c1ed6e4a5e55f66a466592fde919d0e00
OWNER_ACCEPTED_IMPLEMENTATION_DATE = 2026-09-17
```

Owner acceptance covers Foundation, Reference Slice, Golden Spine, UI/UX Final Closure, Cloud Auth + organization/user shell, the final auth visual correction, and Owner runtime / visual review.

It does not accept future coverage expansion, merge to main, deployment, or production cutover.

## Cloud authentication

```text
CLOUD_AUTHENTICATION = INTEGRATED
ACTIVE_ORGANIZATION = VISIBLE
AUTHENTICATED_USER = VISIBLE
LOGOUT = VERIFIED
SESSION_PERSISTENCE = VERIFIED
CLOUD_USER_NE_ATELIER_OPERATOR = VERIFIED
OWNER_REVIEW_RUNTIME = SYNTHETIC_LOCAL_CLOUD
```

## Accepted UX advisories

These remain accepted V1 presentation facts. Do not reopen them without a later Owner GO.

```text
LOGIN_GATE = INTENTIONALLY_MINIMAL
ACCOUNT_CLUSTER_1920 = RIGHT_EDGE_ANCHORED
EMAIL_768 = MAY_ELLIPSIZE_AS_SECONDARY_METADATA
```

## Known product follow-up

Owner acceptance of UI20 does not close known `workos-final` product-contract gaps.

```text
QUOTE_SNAPSHOT_CUSTOMER_REQUEST
JOB_TO_ATELIER_JOB_CONTEXT
CONFIGURATOR_FREEZE_RUNTIME

UI20_ACCEPTANCE_BLOCKER = NO
PRODUCT_FOLLOW_UP = YES
```

Do not implement these in UI20. Do not mark them fixed. Do not work around them in the UI.

## Explicit stop

Do not start Phase 5 or Phase 6.

Do not push, merge to main, deploy, or cut over unless a later Owner GO authorizes that work.

Safe UI20 transport remains canonical on `office952/workos-final` main. See `docs/GOLDEN_SPINE_COMPLETION_V1.md` for the spine execution artifact.
