# WorkOS — Task Dossier + Unique Provider Auto-Binding V1

\`\`\`text
STATUS = OWNER_DIRECTION_APPROVED / TECHNICAL_CONTRACT_TO_VALIDATE
OWNER_GO = 2026-10-16
CODE_IMPLEMENTATION = NOT YET DONE
OWNER_VISUAL_ACCEPTANCE = PENDING
MERGE_DEPLOY_REAL_DATA = HOLD
CANONICAL_REPOSITORY = office952/workos-po
\`\`\`

## Purpose and authority

This is an **implementation-ready product brief** for the operation workspace, not a second execution engine or an assertion that these features already exist. The Owner approved the direction: allow operators to attach task-scoped production information, and eliminate redundant machine selection when there is exactly one eligible provider.

- [WorkOS Creative Production Experience V1](WORKOS_CREATIVE_PRODUCTION_EXPERIENCE_V1.md), currently a proposal; this task gives operational substance to its Execution floorplan.
- [Current UI/UX policy](WORKOS_UIUX_AUTHORITY_CURRENT.md), which supersedes mandatory historical Figma and palette rules.
- [Notion owner decision](https://app.notion.com/p/3fb8ea98e40f8163ac84dcc2bcca1366).
- [Job Operational Hub V1 — research](https://app.notion.com/p/3e68ea98e40f81a5ab80df39ca2b0adc), which distinguishes task, observation, issue, event and physical material truth.
- [N-009 record](https://app.notion.com/p/3fa8ea98e40f81d5b039e664e1ca1ef5); N-009 material request invariants stay intact.

Canonical business semantics belong to \`apps/api\` and \`packages/domain\`; UI is a projection. No customer-specific fork. No real DB/Cloud mutation, no merge/deploy from this decision.

## A. Task Dossier: all production information belongs to the actual operation

**Operator experience:** open an operation from Atelier; see the current task, real next permitted action and a contextual technical dossier. Accessing or adding an observation does not require the task to be in progress and does not change its readiness. The same dossier is reachable from the job workspace.

Information roles are distinct:
1. **PRODUCTION_REFERENCE / INSTRUCTION.** Approved, versioned instructions and technical source. Changes require an authorized role; current production source is explicit. Task may reference a shared job-level artifact instead of duplicating bytes.
2. **OPERATOR_OBSERVATION.** Short or long free note optionally associated with evidence. Saved independently from task completion, can be added before/during/after execution as policy allows; never silently changes machine selection, job priority, Product Truth, tasks or hard gates.
3. **TASK_EVIDENCE.** Photo, PDF, production file, sketch/technical document attached to job and zero or more specific task references. Store binary outside Git in the organization-isolated WorkOS data root, with immutable version identity, hash/size/type, uploader and server timestamp.
4. **ISSUE_REPORTED.** Structured report/reason and optional text or attachment. It is not a free-text note masquerading as a domain blocker. Report alone does not auto-change task status; an authorized/domain-owned transition is a separate action.
5. **EXISTING_COMPLETION/QC/REWORK_NOTES.** Keep the existing dedicated evidence contracts and audit; task dossier augments rather than replaces them.

**Minimal new domain model to design/implement if justified by audit:**
- parent job / plan / task identifier + tenant;
- typed observation or reference (operator/account actor, createdAt, content, optional linked artifact IDs and related event);
- artifact immutable version, stored file identity, MIME, size/hash, uploadedAt/by, source/approval status only if the engine defines approval;
- task ↔ artifact links allowing one shared object referenced by multiple tasks;
- list/upload/download endpoints scoped to organization, job and task with authorized operations and per-file validation.

**Safety:** no path traversal, no inline unsafe SVG/HTML, no arbitrary filesystem paths in logs or responses; bounded file size and format, storage keys opaque, fail-closed tenant checks and authenticated download. Existing Request attachments pattern is reusable as an approach, not proof that task attachments exist. No secrets or files in Git, no false promise of native CDR/DXF/G-code preview.

**Version semantics:** never replace production-approved artifact bytes in place. New upload creates a version/new artifact; the historical task continues to point to the version actually used. Approval/switch of current technical reference requires explicit role permissions and recorded reason if supported; otherwise leave as an unresolved contract gate rather than fabricate approval flow.

## B. Smart provider binding: remove needless action, not safety

**Known existing code:**
- \`ExecutionPage.tsx\` preselects one eligible provider, but still renders \`Alocă\`.
- \`apps/api/src/execution/presentExecutionPlan.ts\` exposes \`canAssignProvider\` only to Owner.
- \`packages/domain/src/execution/lifecycle.ts\` refuses claim/start with \`missing_assignment\`.
- \`liveEligibleProviders\` filters ACTIVE providers by capability; ACTIVE is **not** a verified free/available/reserved machine.
- \`execution-provider-assignment.test.ts\` verifies Owner-only manual selection and tenant refusal.

**Approved operator outcome:** when exactly one truly eligible physical provider exists for an internal PLANNED task, WorkOS determines and binds it on the server as part of the appropriate safe, auditable domain transition. There is no extra human \`Alocă\` click. For two or more, preserve an explicit authorized human choice; for zero, explain absence and recovery. This is **not** auto-scheduling, machine-capacity reservation, task priority, or automatic start.

Recommended decision matrix:
- **0**: do not assign or start; render server explanation. No fictional CNC/workcenter.
- **1**: server-authoritative unique resolution, idempotent atomic persistence, labelled “Asociat automat: [provider]”. It may bind during safe plan materialization or atomically during claim/start, whichever current lifecycle semantics support; write evidence of the chosen phase, actor/source and revalidation.
- **2+**: do not pick the alphabetically first option; route through existing Owner/authorized manual assignment. Operator sees explanation, not an unauthorized selector.
- **Previously assigned**: never silently replace after start/completion; return existing assignment if still valid.
- **Provider disappears/becomes invalid**: keep historical audit, do not falsely claim ready. Start remains server-validated. Manual recovery follows existing authorization and task-state rules.
- **Provider identity**: inspect machine vs WORKCENTER modeling and capability equivalence. A count of transport options does not necessarily equal count of physical CNC machines. Fail closed on ambiguous representation.
- **Permissions**: operator PIN and authenticated account are different; do not let operator choose arbitrary machine because unique automatic binding is allowed. If auto-binding occurs on operator claim, it must be an explicitly limited server transition and audited, not a frontend bypass of Owner privilege.
- **Concurrency**: claim/auto-binding is one safe transactional operation; two operators cannot produce two assignments or starts; retries are idempotent. Tenant and job isolation remain enforced.
- **Readiness**: machine lifecycle ACTIVE, machine reservation/busy, tooling and maintenance are not identical. Do not claim capacity/physical confirmation if current contracts do not own it.

**Implementation plan constraints:** decide and document the exact binding lifecycle after inspecting current persistence and request/claim APIs. This is a server/domain change with migration/legacy-plan ramifications and cannot be “fixed” only by hiding a button. Existing explicit provider assignment, external providers, QC and active machine runs remain intact.

## C. Execution page: a memorable, functional signature

The **Fișa operației** is the page identity: the selected operation + truthfully sourced technical dossier + canonical next action.

Wide viewport (1440+): plan navigator ↔ central operation workbench (dominant) ↔ technical dossier (instructions/files/observations/history), collapsing empty technical area. At 1280/768/390 reflow according to task priority; never compress three columns until illegible. The chosen task stays synchronized in URL and content.

Keep **Adaugă observație**, **Atașează fișier**, **Semnalează problemă** as three distinct verbs from **Pornește** and **Finalizează**. The first three must give pending/error/success, preserve input on error and never alter task eligibility on the client. Only real authorized production references are shown; no decorative drawings or invented numbers.

No new component library or global CSS rewrite; use existing semantic layout patterns and per-surface CSS. Accessibility WCAG 2.2 AA target, keyboard/focus, light/dark, reduced motion, readable operator controls. Reuse proven Request attachment UI interactions where appropriate but not commercial request authorization for task files.

## D. Integration and verification gates

**Owner GO is to implement this vertical in a new isolated feature branch**; draft PR(s), CI, independent review follow. Merge/deploy/real operational data remain explicitly unauthorized.

Before coding:
1. Read \`AGENTS.md\`, \`docs/ROADMAP.md\`, \`docs/SOURCE_OF_TRUTH.md\`, \`docs/architecture/WORKOS_CONFIGURATION_FIRST_CANON.md\`, current UI/UX policy, current project contracts, and the existing Task/Cloud storage/attachment/permission paths.
2. Resolve the provider binding lifecycle atomically with no permission bypass, including existing plan upgrades. If more than one domain-consistent solution exists and the differences affect historical plans or ownership, **STOP and surface the minimal decision**, rather than silently inventing a domain policy.
3. Inventory file-storage backend and identify whether new schema is required; synthetic migrations only. Do not run any new migrations or database tests against real production data.

Implementation acceptance:
- Task-scoped observations before/while/after execution, with actor, time, isolation and no effect on eligibility.
- Artifact upload/list/authenticated download, immutable versions/links to job and tasks, safe type/size/path; role-appropriate instructions vs operator evidence.
- Issue reporting separated from notes with no fake hard blocker.
- Provider 0/1/multiple + already assigned + lost provider + inactive + two operators + cross-org + multi-role + external provider + machine/run parity.
- N-009 default advisory, NULL purchase quantity, existing REQUIRED and production eligibility unmodified.
- Real frontend: Operator/Execution plan selection, provider action states, dossier details; keyboard, focus, 1440/1280/768/390, light/dark.
- Targeted domain/API/frontend tests, then lint, typecheck, build, \`pnpm verify:all\`, synthetic browser proof, security review of download/upload and audit.
- Normal commit/push to feature branch, Draft PR, fresh CI and independent review; explicit Owner merge GO later.

## Evidence/status

This file is a **direction and contract proposal approved for implementation**. It does **not** claim the feature is already built, does not amend N-009 migration 043 and does not authorize main merge. PR #85 (N-009) and PR #86 (design benchmark) are separate draft review surfaces; the implementation must use a new branch/PR and report dependencies. Historic quantity/ledger risks in migration 043 are not waived.
