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

WORKOS_LOCAL_RUNTIME_V1 = COMPLETE_ISOLATED_SYNTHETIC
LOCAL_RUNTIME_LOOPBACK_ONLY_V1 = COMPLETE
LOCAL_RUNTIME_OWNER_ACCEPTED = NO

WORKOS_LOCAL_INSTALLATION_V1 = IN_PROGRESS
WORKOS_LOCAL_RUNTIME_AND_INSTALLATION_V1 = IN_PROGRESS
LOCAL_INSTALLATION_OWNER_ACCEPTED = NO
LOCAL_SHORTCUT_LAUNCH_CLOSURE_V1 = COMPLETE_ISOLATED_SYNTHETIC

NEXT_PROGRAM_PRIORITY = INDEPENDENT_REVIEW_THEN_MAIN_INTEGRATION
NEXT_PROGRAM_STATUS = WAITING_REVIEW
NEXT_PROGRAM_STARTED = NO

REAL_CLOUD_WRITE = HOLD
REAL_DB_WRITE = HOLD
DEPLOY = HOLD
CUTOVER = HOLD
FIRST_REAL_BUSINESS_OPERATION = HOLD
REAL_HUB_MEDIA_CLOUD_ROOT_ACCESS = HOLD
REAL_HUB_MEDIA_LOCAL_ADOPTION = HOLD
```

`WORKOS_PO_CLOUD_RUNTIME_AND_RECOVERY_V1` is complete as isolated synthetic proof. It did not access or cut over the real HUB MEDIA Cloud root. See `docs/PRODUCTION_RUNTIME.md`.

`WORKOS_LOCAL_RUNTIME_V1` is complete as isolated synthetic proof. Loopback-only bind is required because Local V1 uses implicit Owner authority. See `docs/LOCAL_RUNTIME.md`.

`WORKOS_LOCAL_INSTALLATION_V1` remains in progress pending independent review. Packaging is accepted. The user-facing Start Menu chain is `wscript.exe` → `hidden.vbs` → packaged Node → `launch.mjs`, without `//nologo` on that chain. Isolated synthetic proof includes generated `.lnk` inspection and the installed `hidden.vbs` entrypoint. It did not install on a real Owner machine and did not touch HUB MEDIA data. See `docs/LOCAL_INSTALLATION.md`.

```text
ONE WORKOS CODEBASE
DEPLOYMENT_PROFILES = LOCAL | CLOUD
SEPARATE_LOCAL_PRODUCT_CODE = NO
SEPARATE_CLOUD_PRODUCT_CODE = NO
CLIENT_SPECIFIC_FORKS = NO
```

Shared: frontend, API, domain, business logic, migrations, Product Truth. Deployment and storage configuration may differ.

The Local installation customer experience is:

```text
INSTALL → INITIALIZE → START WORKOS → BROWSER OPENS → OPERATE
```

Normal daily use of an installed package must not require Cursor, GitHub, a terminal, pnpm, source edits, or direct SQLite edits. Do not install over real HUB MEDIA data. The next step is independent review of the shortcut-launch closure, then main integration, before any real-machine install.

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

These remain open product-contract items. Do not mark them fixed. Do not work around them in the UI.

```text
QUOTE_SNAPSHOT_CUSTOMER_REQUEST
JOB_TO_ATELIER_JOB_CONTEXT
CONFIGURATOR_FREEZE_RUNTIME

UI20_ACCEPTANCE_BLOCKER = NO
PRODUCT_FOLLOW_UP = YES
```
