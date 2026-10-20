# WorkOS PO roadmap

Living program authority for `office952/workos-po`.

This file is not a worklog and not an implementation plan.

```text
CANONICAL_PRODUCT_REPOSITORY = office952/workos-po
NO PARTIAL PRODUCTION CUTOVER
NO PARALLEL PRODUCT TRUTH
```

## Current: PILOT-0 truth and readiness

Living status as of 2026-10-14. Verified `main` is `162e98a5470211dc62cce6198e8cc58593fae158` (PR #75 merge); WorkOS Verify succeeded on that push. Later sections are historical records unless they say otherwise. Merge alone is never Owner acceptance.

### UI/UX authority (2026-10-16)

Owner decision: Figma is not the current UI/UX authority. Product Truth stays in the engine. Experience work starts from the operator's task, explicit Owner direction, and verification in the running application. Policy: `docs/architecture/WORKOS_UIUX_AUTHORITY_CURRENT.md`.

`docs/FIGMA_AUTHORITY.md` and `docs/architecture/WORKOS_VISUAL_LANGUAGE_CANON_V1.md` remain historical provenance. Modular CSS ownership stays in `docs/architecture/WORKOS_UI_STYLE_ARCHITECTURE_V1.md`.

N-009 (draft PR #85, not merged) keeps a missing-material check as an advisory warning while Material Readiness is disabled. A replenishment signal does not require a purchase quantity. This note does not rewrite the milestone history below.

```text
CURRENT_MILESTONE = PILOT-0_TRUTH_AND_READINESS
MAIN = 162e98a5470211dc62cce6198e8cc58593fae158
SYNTHETIC_OPERATOR_RECOVERY_DRILL = EXECUTED / PASS / OWNER_ACCEPTANCE_PENDING
DEPLOY_ROLLBACK_INCIDENT_RUNBOOK = TEMPLATE / NOT_EXECUTED / NOT_ACCEPTED
REAL_ENVIRONMENT_PREFLIGHT = NOT_RUN / TARGET_NOT_IDENTIFIED
DEPLOY_PRODUCTION = HOLD / NOT_AUTHORIZED
CUTOVER = HOLD
REAL_CLOUD_WRITE = HOLD
REAL_DB_WRITE = HOLD
FIRST_REAL_BUSINESS_OPERATION = HOLD / NOT_AUTHORIZED
ASSEMBLY_PRODUCTION_EIC = PARTIAL on main; V4 candidate below / NOT_MERGED
ASSEMBLY_QUOTE_PDF = INTEGRATED (PR #71) / OWNER_ACCEPTANCE_NOT_RECORDED
ASSEMBLY_COMMERCIAL_ACCEPTANCE_V2 = INTEGRATED (PR #74) / OWNER_ACCEPTANCE_NOT_RECORDED
V3_REQUEST_QUOTE_CUSTOMER_COHERENCE = INTEGRATED (PR #75) / OWNER_ACCEPTANCE_NOT_RECORDED
V4_ASSEMBLY_PRODUCTION_EIC = CANDIDATE / NOT_MERGED / OWNER_ACCEPTANCE_NOT_RECORDED
MIGRATION_041_REAL_APPLICATION = HOLD / SEPARATE_APPROVED_PROCEDURE_REQUIRED
PILOT_GATE_A = HOLD
PILOT_GATE_B = HOLD
```

### Production flow simplification candidate (2026-10-20)

Owner-authorized source candidate on top of `184619c` / draft PR #91: offer confirmation opens the job, a single **Trimite în producție** command prepares release and plan, and operations/dossier stay in the job sheet and Atelier. Canonical responsibilities and retired URL mapping: [Production flow canon](architecture/PRODUCTION_FLOW_CANON.md). Candidate only; merge, real-data changes, deployment and visual acceptance remain pending. This note does not change the historical main baseline above.

Cursor reported synthetic UI E2E PASS at `0dbb6b9` on the same audit assembly after member commercial-price persistence was corrected: one order, 17/17 production operations completed and retained after reload. The Owner then authorized targeted execution reliability corrections: current-activity wording, eligibility refresh after operator/People changes, and exclusive active machine runs across jobs. Cursor later reported A/B/C PASS at `868d617` for those reliability corrections, without screenshots. Session expiry remains an observation to isolate. Multi-worker participation, interrupted work timing, delivery/installation and visual acceptance are not covered by these checks.

### Owner planning simplification decision (2026-10-20)

Direction accepted; source candidate implemented on PR #92, runtime/visual validation pending. The Owner rejects repetitive manual estimates and coordinator release of individual tasks. One job-level production command remains the entry; operators record actual work starts. Planning becomes an optional **Pe utilaje și zone** view inside Lucrări instead of a primary workflow page. Keep the workload engine, optional estimates, existing data, eligibility/dependency gates and compatible historical links. Reconcile unique-provider auto-binding with misleading unassigned/allocation prompts. The separate Planning page and navigation entry are retired; `/planificare` redirects to `/lucrari?vedere=utilaje`. Existing estimates remain accessible through optional disclosure. Unique-provider queue placement is read-only and uses the domain binding resolver; genuine resource gaps/choices and manual-only work stay visible. No schema or history rewrite. Contract: [Production flow canon](architecture/PRODUCTION_FLOW_CANON.md#owner-decision-planning-without-repetitive-administration-2026-10-20).

### Work integrated since PR #54

| Work | PR / merge | Evidence class | Owner acceptance |
| --- | --- | --- | --- |
| Request/Catalog configuration coherence and assembly execution | #54 `af15729` | Integrated; functional baseline synthetic-tested at `4a100f3` | Not recorded; visual acceptance was pending (historical section below) |
| Controlled pilot readiness gates | #56 `181b274` | Integrated (documentation) | Not recorded |
| Production origin security regression coverage | #57 `bd2d7ef` | Integrated; synthetic-tested | Not recorded |
| Second organization plane readiness fail-closed | #58 `954fddf` | Integrated; synthetic-tested | Not recorded |
| Synthetic recovery drill runbook | #59 `bcdf32d` | Integrated; executed once on synthetic roots in PILOT-0 | Not recorded |
| Organization setup and operator acceptance | #60 `d79881b` | Integrated (documentation); not operationally tested | Not recorded |
| CI synthetic backup/restore proof | #61 `9af96ba` | Integrated; the workflow runs only on manual dispatch or PRs touching recovery files (last run 2026-10-09) | Not recorded |
| ACM and letters product invariants | #64 `88c53ea` | Integrated; automated tests | Not recorded |
| Integrated assembly quote remediation, including the PR #65 EIC reconciliation `6efbbe0` | #66 `0fb380c` | Integrated; synthetic E2E per [its record](INTEGRATED_ASSEMBLY_QUOTE_REMEDIATION_V1.md) | Not recorded; its Owner checklist stayed open (standalone letters unchanged, Forex/ACM separation, visual sign-off) |
| Unified Quotes Registry V1 | #67 `d65c049` | Integrated | Not recorded |
| Commercial UX coherence V1 | #68 `08809b9` | Integrated; presentation only ([report](review/commercial-ux-coherence-v1/REPORT.md)) | Not recorded |
| Commercial Total Consistency V1 | #69 `eb3f3c4` | Integrated | Not recorded |
| PILOT-0 truth and readiness reconciliation | #70 `5e5b505` | Integrated (documentation) | Not recorded |
| Assembly quote PDF with frozen commercial identity | #71 `328a339` | Integrated; automated tests | Not recorded |
| Unconfirmed rate acknowledgement before quote freeze V1 | #72 `96e2707` | Integrated; automated tests | Not recorded |
| V1 operational safety and assembly VAT clarity (F04) | #73 `474ce5d` | Integrated | Not recorded |
| V2 assembly commercial flow: acceptance on the exact frozen quote, P1 stale-configuration refusal | #74 `498f3ca` | Integrated | Not recorded |
| V3 unified request, quote and customer commercial history | #75 `162e98a` | Integrated | Not recorded |

Not integrated: draft #62 (synthetic staging gate), draft #63 (flat BACK; #66 kept its BACK rules and discarded the separate SKU) and open #65 (superseded by #66). PILOT-0 does not close or change them.

### Incomplete

- Assembly production costing stays `PARTIAL` on `main`: mounting, final assembly inspection and assembly packaging have no cost evidence, and `reconcileAssemblyEic` cannot price assembly operations yet. Assemblies are excluded from cost-complete pilot claims. The V4 candidate below prices them from organization evidence; it is not merged.
- Migration 041 (V4 candidate) runs automatically the first time a database is opened by a build that contains it. Applying it to any real database needs a separate Owner-approved procedure (backup, target identification, verification); merging V4 does not authorize it.
- Real-environment preflight not run; target environment and operator not identified.
- Production deployment not authorized; deploy artifact form and host stop mechanism not decided.
- First real job not authorized; no pilot organization provisioned or configured with Owner-confirmed rates.
- Owner acceptance of the PR #54–#75 work above is not recorded.

### PILOT-0 evidence

- [Pilot readiness gate and Gate A / Gate B matrix](PILOT_READINESS_GATE_V1.md)
- [Synthetic recovery drill evidence](PILOT_0_SYNTHETIC_RECOVERY_DRILL_EVIDENCE_V1.md) — PASS on new synthetic roots at `eb3f3c4`; four runbook findings
- [Deploy, rollback and incident STOP runbook template](PILOT_DEPLOY_ROLLBACK_INCIDENT_RUNBOOK_V1.md) — not executed

## Historical: request and Catalog coherence candidate (2026-10-07/08)

Integrated on `main` through PR #54 (`af15729`, 2026-10-09). The text below is the candidate record of that time. Its "one active candidate" and authorization statements are historical; visual acceptance was pending then and no later Owner acceptance is recorded.

Owner direction of 2026-10-07 is recorded in [Request, Catalog and configuration](architecture/REQUEST_CATALOG_CONFIGURATION_CANON.md). Cursor's withdrawn implementation is preserved at `checkpoint/cursor-handoff-20261007-2037`, `3046aa700fcd8cb8384ed63497fad62f83b79aaa`, from UI base `b5071b6acb59025edbdf82338c5c3613dcd7a5d3`.

One active source candidate: `feat/product-system-request-coherence` in `office952/workos-po`. Scope: definition-only Catalog, central request/CUI intake, in-request product selection, existing assembly continuity, removal of retired code and contradictory active documentation. Source implementation, commit and push are authorized by the current Owner session. Merge/deploy, real Cloud/business-data operations, schema/migrations/seeds remain unauthorized.

The functional coherence baseline and its automated checks are complete. The server action mismatch found at `836cc9e` was corrected at `4a100f38bb75111a5a6f491aec2c5c829357aed0`. Cursor's isolated synthetic runtime reports complete that baseline's scoped A–F journey, including confirming/reopening ACM + letters, stale-price protection, light at measured 1440/768/390 viewports and core keyboard navigation. Codex reviewed supplied dark intake captures and decisive source contracts; final light/assembly media is referenced in the Windows report and was not independently inspected. The baseline's functional recovery gate is closed on that attributed evidence; visual acceptance and integration remain pending. Full arbitrary definition authoring and durable cross-device draft persistence remain open; do not relabel the projection as a complete editor. Evidence and open limits are recorded in [REPORT.md](review/request-catalog-coherence/REPORT.md). These earlier runtime results apply to `4a100f3`, not automatically to later UI changes.

Current UX stage, 2026-10-08: the full-width new-request intake was published at `e62c1ad9da558347af554356e3a290a80c87072a`. The Owner responded positively after the run handoff and asked to continue; imagery is deferred. The Cereri de oferta register remains the accepted visual reference. Cursor's current task is load/build/run only; manual inspection belongs to the Owner, with no requested Cursor audit or evidence loop.

The Configurator workspace and component-navigation refinement were published at `e6e8eccfe8978dfae3071c23004b96809afca4fc` and `c75dac74c0d337033de4446a0dc30f45c3203a03`. The current stage on the same branch follows the Owner-supplied `WORKOS_UI_DESIGN_AUTHORITY_V14_BACK_VARIANT_FIXED_POLISH.html#configurator`: left outline, central vertical construction/technical context, right focused inspector, and compact selector with editor first on tablet/phone. Configurație / Verificare / Pregătire ofertă remain separate work areas. Every actual component remains individually accessible; server identifiers bind identity facts and source-field navigation.

Live read-only technical details now come from the existing domain evaluator, including BACK's mapped FACE area, electrical settings with organization/platform version provenance, module/power/supply quantities and frame dependencies. The browser formats no calculations and invents no manufacturing values. Draft edits hide prior measured/calculated results immediately while preview refreshes; settings and formulas remain organization administration. Calculation rules, readiness, API operations and persistence are unchanged. Support-dependent grooved/flat BACK machining, its dimensions/side closure/process evidence, complete definition authoring, arbitrary group overrides and CAD graphics remain open domain/design work. The prototype's machining toggle is not an implemented product field.

Automated checks and reference provenance are recorded in REPORT.md. Current geometry/theme/keyboard acceptance remains pending Owner inspection; older baseline media is not proof of this layout. Cursor loads/builds/runs only, including the updated candidate API; no Cursor audit/evidence loop. Source commit/push is authorized; merge/deploy and real data operations remain outside this stage.

## Historical accepted baseline before the coherence candidate

All milestone/current/next/authorization flags below describe prior decisions at their recorded commits. They are historical evidence, not a second live status or authorization for this candidate. Domain/production invariants remain binding unless explicitly changed; old Catalog-first navigation is superseded by the active flow contract.


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
CUSTOMER_OPERABLE_WITHOUT_CURSOR = YES
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
CURRENT_PROGRAM = WORKOS_PRODUCT_COMPLETION_V1
CURRENT_PROGRAM_STATUS = COMPLETE / OWNER_ACCEPTED
WORKOS_PRODUCT_COMPLETION_V1 = COMPLETE / OWNER_ACCEPTED
WORKOS_PRODUCT_COMPLETION_V1_REAL_V1_BLOCKERS = NONE
WORKOS_PRODUCT_COMPLETION_V1_P0 = 0
WORKOS_PRODUCT_COMPLETION_V1_P1 = 0
PRODUCT_V1_IMPLEMENTATION = CLOSED
CONTROLLED_ORGANIZATION_PROVISIONING_V1 = COMPLETE / OWNER_ACCEPTED / INTEGRATED
CONTROLLED_ORGANIZATION_PROVISIONING_V1_INTEGRATED_ON_MAIN = YES
CONTROLLED_ORGANIZATION_PROVISIONING_V1_COMMIT = 6ad2f4b78b3dbd72dbb286107c6ac04e8dafcc9c
ADDITIONAL_USER_OPERATOR_TOOLING_V1 = COMPLETE / OWNER_ACCEPTED / INTEGRATED
ADDITIONAL_USER_OPERATOR_TOOLING_V1_INTEGRATED_ON_MAIN = YES
ADDITIONAL_USER_OPERATOR_TOOLING_V1_COMMIT = 47d18c3134e1239c3934a995541a9ca352587084
PRODUCTION_PILOT_READINESS_V1 = COMPLETE / OWNER_ACCEPTED
MATERIAL_READINESS_V5B = COMPLETE / OWNER_ACCEPTED / INTEGRATED
MATERIAL_READINESS_V5B_PR = 37
MATERIAL_READINESS_V5B_MERGE_COMMIT = 6f53c58e1d96ab692236953abadf02f5e41ee5f9
EXTERNAL_PRODUCTION_HANDOFF_V1 = COMPLETE / OWNER_ACCEPTED / INTEGRATED
EXTERNAL_PRODUCTION_HANDOFF_V1_PR = 38
EXTERNAL_PRODUCTION_HANDOFF_V1_MERGE_COMMIT = 488e99c0fc35edb6f271bb9f286340bd1a1ac05e
QC_REWORK_V1 = COMPLETE / OWNER_ACCEPTED / INTEGRATED
QC_REWORK_V1_INTEGRATED_ON_MAIN = YES
QC_REWORK_V1_COMMIT = 259b804ae2506b6ca1d2b19054f40f7993985537
OWNER_ACCEPTED_PRODUCTION_PILOT_READINESS_V1 = YES
PREFLIGHT_ENGINE = SYNTHETICALLY_PROVEN
REAL_ENVIRONMENT_PREFLIGHT = NOT_RUN
DEPLOY_PRODUCTION = HOLD
CUTOVER = HOLD
FIRST_REAL_BUSINESS_OPERATION = HOLD
NEXT_PROGRAM = REAL_ENVIRONMENT_PREFLIGHT / PRODUCTION_PILOT
NEXT_PROGRAM_STATUS = NOT_STARTED / OWNER_GO_REQUIRED
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
EXECUTION_REALITY_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_EXECUTION_REALITY_V1 = YES
ACTUAL_DURATION_V1 = COMPLETE / OWNER_ACCEPTED
MACHINE_RUN_V1 = COMPLETE / OWNER_ACCEPTED
PLANNED_VS_ACTUAL_TIME_V1 = COMPLETE / OWNER_ACCEPTED
EXECUTION_REALITY_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
PLANNING_IMPLEMENTATION = OWNER_ACCEPTED
OWNER_ACCEPTED_PLANNING_IMPLEMENTATION = YES
PLN1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
CAPACITY_IMPLEMENTATION = CANCELLED_WEEKLY_SUPPLY
SCHEDULING = NOT_STARTED / OUT_OF_SCOPE_V1
MEMBER_DAG_COMPOSITION_CORRECTIONS = DEFERRED / NOT_CAPACITY_BLOCKER
PLANNING_CAPACITY_CANON = docs/architecture/PLANNING_CAPACITY_V1_CANON.md
CONFIGURATION_FIRST_CANON = docs/architecture/WORKOS_CONFIGURATION_FIRST_CANON.md
VISUAL_LANGUAGE_CANON = docs/architecture/WORKOS_VISUAL_LANGUAGE_CANON_V1.md
UI_STYLE_ARCHITECTURE_CANON = docs/architecture/WORKOS_UI_STYLE_ARCHITECTURE_V1.md
POST_LOGIN_UI_DIRECTION = INDUSTRIAL_HARDWARE_FUTURE_INTELLIGENCE
NEXT_POST_LOGIN_UI_SURFACE = CERERI_DE_OFERTA
REQUESTS_UI_PILOT = OWNER_DIRECTED / NOT_STARTED
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
CONTROLLED_PLATFORM_OPERATOR_PROVISIONING = IMPLEMENTED
CUSTOMER_SELF_SERVICE_PROVISIONING_UX = DEFERRED
PRODUCTION_ORG_PROVISIONING_UX = DEFERRED / ADMIN_TOOLING_DEBT / NONBLOCKING
ADMIN_TOOLING_DEBT = RECORDED_NOT_IMPLEMENTED
```

Controlled platform operator provisioning (`pnpm cloud:provision-organization`) and additional Cloud users (`pnpm cloud:add-organization-user`) are implemented. Recorded deferred admin debt remains nonblocking: self-service signup, email verification, password recovery, MFA, billing/subscriptions, production organization provisioning UX, commercial onboarding automation. People Admin V1 and Machine/Workcenter Admin V1 are complete. Do not build remaining admin debt without a later Owner GO.

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

Product Enablement Admin V1 is complete after Owner acceptance and merge of PR #19. Letters Product Truth V1 and ACM Product Truth V1 remain complete. People and Machine Admin V1 is complete. Standalone CF5 is not required first. Remaining Configuration-First work is domain-by-domain when actual product work requires it. Execution Expansion V1 is Owner-accepted and integrated. Planning Workload V1 remains Owner-accepted; the living global program is owned by the Current program section of this roadmap. PLN1 is Owner-accepted. PLN2 and Operations Control V1 are Owner-accepted. PLN3 is not started. Next wave is unauthorized.

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

Letters Product Truth V1, ACM Product Truth V1, Product Enablement Admin V1, and People and Machine Admin V1 are complete. Execution Expansion V1 is Owner-accepted and integrated. Planning Workload V1 is Owner-accepted. The living global program is owned by the Current program section of this roadmap. PLN1, PLN2, and Operations Control V1 are Owner-accepted. The previous CAP0 weekly-capacity contract is superseded in part. PLN0 is canon correction only. Weekly provider `availableMinutes` is cancelled. Member DAG / composition corrections remain deferred and are not a Planning blocker. CF5 remains NOT_STARTED and is not selected.

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

## Unified Quotes Registry V1

```text
UNIFIED_QUOTES_REGISTRY_V1 = INTEGRATED / OWNER_ACCEPTANCE_NOT_RECORDED
PR_67 = MERGED
MERGE_COMMIT = d65c049bf76ee35e43d7613ec6cbdec14153ffea
BASE = 0fb380cb383674745686e2fc0af30270e5f56b62
SECOND_QUOTE_ENGINE = NO
SCHEMA_MIGRATION = NO
```

Oferte lists standalone product quotes and assembly quotes from one read model (`listQuoteOverview`) with an explicit `kind`. Assembly quotes remain one record in `assembly_quote_snapshots`; child member quotes are not persisted separately and cannot be double-counted. `/api/quotes/:id` resolves either kind; the assembly view is read-only, shows member sections, totals, superseded state and links to request, assembly and order. Internal cost is owner-only and never summed into the selling price.

Assembly production cost stays `PARTIAL` until the organization configures the assembly-level operations. Minimal configuration proposal, not implemented and with no invented rates:

- `MOUNT_LETTERS_ON_PANEL` / `MOUNT_LOGO_ON_PANEL`: a LABOR CostRecipe, an Owner-decided quantity basis at assembly level (for example per member or per letter) and an Owner-confirmed rate.
- `INSPECT_FINISHED_ASSEMBLY`: same three inputs.
- `PACK_PRODUCT`: `RCP_PACK_PRODUCT` and its rate already exist; only the assembly-level area basis (which member face or envelope area) needs an Owner decision.

PILOT-0 correction: configuration alone is not enough. `reconcileAssemblyEic` treats every assembly-level production operation as unpriced, so a domain change is also required. The `RCP_PACK_PRODUCT` rate reaches a new organization only as an unconfirmed platform default; whether a per-m² packing rate applies to a panel assembly is itself an Owner decision. See the assembly scope in [the pilot readiness gate](PILOT_READINESS_GATE_V1.md).

Open at the time of PR #67: customer hub and request linked-offer lists remain product-only; no assembly quote document/PDF yet. Later status: the assembly quote PDF was integrated by PR #71; the customer/request lists are addressed by the V3 candidate below.

## Assembly Commercial Acceptance V2

Recorded as a candidate; integrated by PR #74 (`498f3ca`, 2026-10-14), together with the P1 refusal of quotes whose confirmed configuration became stale. Owner acceptance is not recorded.

```text
ASSEMBLY_COMMERCIAL_ACCEPTANCE_V2 = CANDIDATE / NOT_MERGED / OWNER_ACCEPTANCE_NOT_RECORDED (historical flag; see PR #74)
ACCEPTANCE_LOCATION = ASSEMBLY_QUOTE_PAGE
SECOND_QUOTE_ENGINE = NO
SCHEMA_MIGRATION = NO
DOMAIN_CHANGE = NO
```

Owner decision: commercial acceptance happens on the frozen assembly quote (`/oferte/ansamblu/:quoteSnapshotId`), not on the assembly page. The assembly page owns composition, confirmation, rate acknowledgement and quote freezing (`Îngheață oferta`), then links to the exact frozen quote and its PDF; the confirmation action is rendered only while the assembly is `DRAFT`.

`POST /api/assemblies/:assemblyId/accept` now requires `{ quoteSnapshotId }`. The server accepts only when it equals the assembly's current snapshot and no order exists; otherwise it refuses before writing (`400 quote_identity_required`, `409 assembly_quote_superseded` with `currentQuoteSnapshotId`, `409 assembly_quote_already_accepted`). The assembly quote envelope projects `acceptance: { canAccept, reason }` from the same check (Owner only, never for superseded or ordered quotes); the assembly detail projects `quoteSnapshotId` and `quoteFreezable`. Domain acceptance (`acceptAssemblyQuote`) is unchanged.

## Commercial Total Consistency V1

```text
COMMERCIAL_TOTAL_CONSISTENCY_V1 = INTEGRATED / OWNER_ACCEPTANCE_NOT_RECORDED
PR_69 = MERGED
MERGE_COMMIT = eb3f3c4915e6c18cad91ac613af55fdde934459c
BASE = 08809b9c33e6ab104c4375c3b530fb040a66f842
SCHEMA_MIGRATION = NO
```

A standalone quote with on-site installation shows the same total in Oferte, request/customer linked-offer lists, the quote detail, the PDF and the order. `quoteSnapshotCustomerTotal` (`packages/domain/src/commercial/quoteDocument.ts`) is the single read of that total: the frozen `jobCommercial` when present, otherwise the frozen product `commercial`. It reads frozen values only; nothing is recalculated with current rates, installation is not added a second time, and production EIC is unchanged. Historical product-only (schema v1) snapshots keep their product total.

## V3 Request, Quote and Customer commercial coherence

Integrated by PR #75 (`162e98a`, 2026-10-14). Owner acceptance is not recorded.

```text
V3_REQUEST_QUOTE_CUSTOMER_COHERENCE = CANDIDATE / NOT_MERGED / OWNER_ACCEPTANCE_NOT_RECORDED (historical flag; see PR #75)
BRANCH = feat/v3-request-quote-customer-coherence
BASE = 498f3caabccba7eafeb2696d0a65ceb790f2f8cb
SECOND_QUOTE_ENGINE = NO
SCHEMA_MIGRATION = NO
DOMAIN_CHANGE = NO
PRICING_VAT_ACCEPTANCE_CHANGE = NO
```

The customer registry, customer workspace and request detail read the same composition as Oferte (`commercialQuoteOverview` in the API runtime): every frozen product and assembly snapshot once, with its existing stage, superseded flag and order. An assembly quote belongs to a customer only through its persisted `requestId` and that request's customer (the request customer is locked once a quote is linked); a quote without a request is never attached to a customer or request. Request linked offers keep product links first, then every assembly snapshot of that request, so historical versions stay separately traceable and the request's `OPEN_QUOTE` target is unchanged. The request list (Cereri) projection is unchanged. Client and request rows open product quotes on the product route and assembly quotes on `/oferte/ansamblu/:id`; superseded versions without an order show the server's superseded label instead of an acceptance stage.

## V4 Assembly Production EIC

```text
V4_ASSEMBLY_PRODUCTION_EIC = CANDIDATE / NOT_MERGED / OWNER_ACCEPTANCE_NOT_RECORDED
BRANCH = feat/v4-assembly-production-eic-041
BASE = 162e98a5470211dc62cce6198e8cc58593fae158
SCHEMA_MIGRATION = 041_assembly_operation_cost_policy (organization plane, append-only)
MIGRATION_041_REAL_APPLICATION = HOLD / SEPARATE_APPROVED_PROCEDURE_REQUIRED
SECOND_PRICING_OR_COST_ENGINE = NO
COMMERCIAL_PRICE_CHANGE = NO
QUOTE_IDENTITY_ACCEPTANCE_RELEASE_CHANGE = NO
EVIDENCE = AUTOMATED_TESTS + SYNTHETIC_BROWSER_E2E (no real data)
```

Assembly-level operations (mounting letters/logo on the panel, final assembly inspection, final packaging) get an internal cost when a quote is frozen. The domain (`packages/domain/src/assembly/operationCost*.ts`) evaluates each operation to one typed outcome: `COSTED` (confirmed rate), `UNCONFIRMED_RATE` (calculable, marked as needing verification and disclosed through the existing rate acknowledgement), `INCLUDED` (organization policy says final inspection is part of other operations, cost 0), or a gap (`MISSING_POLICY`, `MISSING_QUANTITY`, `MISSING_RATE`, `INCOMPATIBLE_UNIT`). Gaps are never zero: the known total is marked `PARTIAL`. Costed lines record quantity, unit, rate, the cost-evidence row and the quantity provenance (operator person-hour estimate, or the support panel face area with its production input hash and recipe).

- Organization policy lives in `assembly_operation_cost_policy_versions` (migration 041): numbered versions, the next version only, no update or delete. Final inspection is `NOT_CONFIGURED`, `INCLUDED_IN_OTHER_OPERATIONS` or `SEPARATE_LABOR`; final packaging is `NOT_CONFIGURED` or `PANEL_FACE_AREA`. No policy reads as not configured; nothing is backfilled.
- The workshop labor rate is the cost-evidence resource `LAB-WORKSHOP-LABOR` (EUR per person-hour), created and superseded through the existing cost-evidence routes.
- Person-hour estimates are edited on the assembly (`PUT /api/assemblies/:id/operation-estimates`) until the current quote is frozen or an order exists. The frozen result is sealed into the quote snapshot with an evidence hash; `reconcileAssemblyEic` reads only that frozen evidence, so later rate or policy changes never alter a frozen quote, order or release.
- Owner administration: `GET /api/admin/assembly-operation-cost`, `POST /api/admin/assembly-operation-cost-policy` (stale versions refused). Members see modes but no amounts and cannot edit; other organizations get nothing.
- UI: section `Cost intern ansamblare` on the assembly page (Owner only) and in Administrare → Dovezi de cost. Customer prices and quote totals are unchanged.
- Typed recipe trace correction: when a production snapshot is frozen, each operation's recipe is resolved with the composition node's type id, so the frozen trace names the same recipe EIC charged (for example the sheet-panel CNC recipe for the ACM cassette face) instead of the generic process/scope recipe. Monetary EIC is unchanged; letters and logo traces are unchanged. This changes the pinned hash of the legacy identity-free fixture and the production input hash of new ACM freezes. Existing frozen snapshots are not rewritten.

Migration 041 runs automatically the first time any database is opened by a build that contains it. The runner applies each file and then records it, without one enclosing transaction; the DDL uses `IF NOT EXISTS`, and the tests prove recovery after an interruption between table creation and registration. Applying 041 to a real database still requires a separate Owner-approved procedure. Merging this candidate does not authorize opening a real database with it.

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

Execution Expansion V1 is Owner-accepted and integrated on main. EXE1 replaced hardcoded `executionReadiness = NOT_IMPLEMENTED` with topology-derived READY|BLOCKED. EXE2 made provider assignment explicit and projected Owner-only `canAssignProvider`. EXE3 made the whole plan comprehensible from existing server facts. EXE4 records operator actual consumption through the existing complete contract. At that EXE4 acceptance, scheduling and MachineRun were still unimplemented.

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

## Historical product-completion program

```text
CURRENT_PROGRAM = WORKOS_PRODUCT_COMPLETION_V1
CURRENT_PROGRAM_STATUS = COMPLETE / OWNER_ACCEPTED
WORKOS_PRODUCT_COMPLETION_V1 = COMPLETE / OWNER_ACCEPTED
WORKOS_PRODUCT_COMPLETION_V1_REAL_V1_BLOCKERS = NONE
WORKOS_PRODUCT_COMPLETION_V1_P0 = 0
WORKOS_PRODUCT_COMPLETION_V1_P1 = 0
PRODUCT_V1_IMPLEMENTATION = CLOSED
PRIMARY_USER_JOURNEY = COMPLETE
CUSTOMER_OPERABLE_WITHOUT_CURSOR = YES
NO_CLIENT_CODE_FORK = YES
CONTROLLED_ORGANIZATION_PROVISIONING_V1 = COMPLETE / OWNER_ACCEPTED / INTEGRATED
CONTROLLED_ORGANIZATION_PROVISIONING_V1_INTEGRATED_ON_MAIN = YES
CONTROLLED_ORGANIZATION_PROVISIONING_V1_COMMIT = 6ad2f4b78b3dbd72dbb286107c6ac04e8dafcc9c
ADDITIONAL_USER_OPERATOR_TOOLING_V1 = COMPLETE / OWNER_ACCEPTED / INTEGRATED
ADDITIONAL_USER_OPERATOR_TOOLING_V1_INTEGRATED_ON_MAIN = YES
ADDITIONAL_USER_OPERATOR_TOOLING_V1_COMMIT = 47d18c3134e1239c3934a995541a9ca352587084
PRODUCTION_PILOT_READINESS_V1 = COMPLETE / OWNER_ACCEPTED
MATERIAL_READINESS_V5B = COMPLETE / OWNER_ACCEPTED / INTEGRATED
MATERIAL_READINESS_V5B_PR = 37
MATERIAL_READINESS_V5B_MERGE_COMMIT = 6f53c58e1d96ab692236953abadf02f5e41ee5f9
EXTERNAL_PRODUCTION_HANDOFF_V1 = COMPLETE / OWNER_ACCEPTED / INTEGRATED
EXTERNAL_PRODUCTION_HANDOFF_V1_PR = 38
EXTERNAL_PRODUCTION_HANDOFF_V1_MERGE_COMMIT = 488e99c0fc35edb6f271bb9f286340bd1a1ac05e
QC_REWORK_V1 = COMPLETE / OWNER_ACCEPTED / INTEGRATED
OWNER_ACCEPTED_PRODUCTION_PILOT_READINESS_V1 = YES
PREFLIGHT_ENGINE = SYNTHETICALLY_PROVEN
REAL_ENVIRONMENT_PREFLIGHT = NOT_RUN
DEPLOY_PRODUCTION = HOLD
CUTOVER = HOLD
FIRST_REAL_BUSINESS_OPERATION = HOLD
NEXT_PROGRAM = REAL_ENVIRONMENT_PREFLIGHT / PRODUCTION_PILOT
NEXT_PROGRAM_STATUS = NOT_STARTED / OWNER_GO_REQUIRED
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
EXECUTION_REALITY_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_EXECUTION_REALITY_V1 = YES
ACTUAL_DURATION_V1 = COMPLETE / OWNER_ACCEPTED
MACHINE_RUN_V1 = COMPLETE / OWNER_ACCEPTED
PLANNED_VS_ACTUAL_TIME_V1 = COMPLETE / OWNER_ACCEPTED
EXECUTION_REALITY_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
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
PRODUCTION_PILOT_READINESS_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
```

WorkOS Product Completion V1 is Owner-accepted and closed. Product V1 implementation is closed. Real V1 blockers are none. Production Pilot Readiness V1 remains Owner-accepted as the read-only preflight engine. Synthetic proof passed. A real environment preflight has not been run. This closure does not authorize deployment, cutover, real Cloud access, real Cloud writes, or production organization creation. Controlled platform operator provisioning (`pnpm cloud:provision-organization`) and additional Cloud users (`pnpm cloud:add-organization-user`) are implemented. Customer self-service / production organization provisioning UX remains deferred nonblocking admin debt. Self-service signup, email verification, password recovery, MFA, billing, commercial onboarding automation, cutover, and first real business operation remain deferred and nonblocking. Next program direction is Real Environment Preflight / Production Pilot; it is not started and requires a later Owner GO.

```text
INDEPENDENT_REVIEW = PASS
P0 = 0
P1 = 0
TARGETED_TESTS = PASS
VERIFY_ALL = PASS
SYNTHETIC_PREFLIGHT_PROOF = PASS
READ_ONLY = YES
OUTPUT_SANITIZATION = PASS
REAL_DATA_USED = NO
REAL_ENVIRONMENT_PREFLIGHT = NOT_RUN
```

Accepted advisories, not a correction wave:

- `GET /api/ready` can be weaker than pilot preflight when an active organization has no operational plane; pilot preflight still blocks that case
- `api_production_build` proves the supported build contract; deployment packaging remains a future deployment concern

Execution Reality V1 is Owner-accepted and integrated on main. It records optional operator-confirmed task `actualDurationMinutes` and explicit MachineRun segments. Planned effort, lifecycle timestamps, task actual duration, and machine-run duration stay independent. Null actual duration means unknown, not zero. A new machine run requires the assigned operator to be active, available, and currently eligible. Stopping an already-open run stays with that assigned operator and does not re-check later availability or skill. It does not replace Planning. PLN0 workload-first canon is complete. PLN1 is Owner-accepted: `plannedEffortMinutes`, derived provider workload, `/planificare`, and the synthetic Owner reference runtime at `http://127.0.0.1:8787`. `planningWeek` and weekly `availableMinutes` remain cancelled. PLN2 and Operations Control V1 are Owner-accepted. PLN3 is not started. Scheduling is out of V1. Member DAG / composition corrections remain deferred and are not a Planning blocker. Host Context V1, Mounting Interface V1, and the site-installation vertical are Owner-accepted. Next wave is unauthorized.

```text
INTEGRATED_ON_MAIN = YES
INDEPENDENT_REVIEW = PASS
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

Execution Reality V1 acceptance advisories, not a correction wave:

- ExecutionPage and JobDetailPage are large components; decomposition is maintenance work, not a V1 blocker.
- Compact execution task lists can be visually dense; global UI/UX redesign is separate.
- existing mobile navigation debt is outside Execution Reality V1.

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
