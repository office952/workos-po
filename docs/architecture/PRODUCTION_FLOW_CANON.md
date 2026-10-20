# Production entry and workspace ownership

Candidate authorized by the Owner on 2026-10-20 in `office952/workos-po`. Built on `184619c` / draft PR #91. This changes source and navigation; it does not authorize merge, deployment, real data operations or claim visual acceptance.

## One active experience per responsibility

| Experience | Responsibility | Canonical location |
| --- | --- | --- |
| Offer | Review one frozen version; **Confirmă comanda** records acceptance and creates/retrieves its order, then opens its job | Existing product / assembly offer URL |
| Job sheet | Coordinator: situation, operations with selected dossier, documents/materials, results | `/lucrari/:jobId` with `sectiune=situatie`, `operatii`, `documente`, `rezultate` |
| Atelier | Operator identification, eligible inbox, selected operation and execution commands in one workspace | `/atelier?job=…&plan=…&task=…` (job optional) |
| Work by resource | Optional cross-job operations grouped by machine/zone; manual work and real resource gaps remain visible | `/lucrari?vedere=utilaje` |

Commercial source and lifecycle history are disclosure details in Situation. Files and material preparation are sections of the existing sheet, not new pages. Operation identity, instructions and files identify the work; they do not teach the trade.

## Owner decision: planning without repetitive administration (2026-10-20)

Direction accepted by the Owner; implemented as a source candidate on PR #92. Local runtime and visual validation of this presentation change remain pending.

- The coordinator sends the entire job to production once. Release generates its operation graph; the coordinator does not have to authorize or start each operation separately.
- The operator records the actual beginning of work. Readiness, dependencies and eligibility remain server-owned; releasing the whole job must not mark every operation as started or bypass required gates.
- Manual duration estimates are optional and must not become a production prerequisite or a repeated missing-data warning. Measuring real work, including the separately scoped participation/interruptions capability, is the priority. Unknown estimates remain unknown; do not fabricate them from cost rates or quantities. Any future suggestions from comparable history need their own validated contract.
- Planning is retired as a primary workflow page in favor of the optional cross-job **Pe utilaje și zone** view inside Lucrări. The existing workload engine and historical estimates are retained; `/planificare` redirects with history replacement to `/lucrari?vedere=utilaje`. `PlanningPage` and its stylesheet are replaced by the embedded `JobsWorkload`, not kept as parallel pages.
- A single eligible physical provider requires no repetitive manual choice. The current execution auto-binding remains authoritative; workload presentation must distinguish automatic selection from a real missing resource or a choice between multiple providers. Do not guess provider eligibility in the frontend.
- Replace misleading per-task administrative actions such as **Alocă în execuție** with actions that describe the actual remaining choice or simply open the operation.

The default resource view shows open operations, their job/customer context and server-owned resource explanations. Estimates and their editor appear only after explicit optional disclosure; missing estimates are not routine warnings. A unique eligible provider is a projected queue target, visibly awaiting automatic binding, not a persisted assignment or a start event. Manual operations without a required provider stay visible in their own group. Genuine choices and missing providers remain actionable exceptions. Opening, searching and switching views never writes assignment/start commands; drafts and the registry search survive view switching within the mounted registry.

This candidate does not introduce multi-worker timing or authorize merge, deployment or real-data changes.

### Resource-view runtime review and keyboard follow-up (2026-10-21)

Cursor reported the main resource-view behaviors passing at `fd5de5e`: integrated navigation and historical redirect, estimates optional by default, unique-provider projection without starting work, optional estimate draft continuity, and the finished audit job unchanged. Search survives switches between the two mounted registry views; losing it after leaving for Start is within the current contract. Manual-only work was observed; the fixture did not contain a genuine missing-provider or multiple-choice case. No screenshots were available. The keyboard/focus check remained partial, so this is not visual or accessibility acceptance.

The focused follow-up uses an explicit disclosure button with `aria-expanded`; closed settings are not rendered as accessible or focusable controls. The resource view and its navigation links have visible keyboard-focus styles. Automated interaction checks cover Tab, Shift+Tab, Enter and Space without posting task mutations. Local browser verification of this correction remains pending; it does not change business data, eligibility, estimates or their persistence.

## Coordinated server commands

- Product `POST /api/products/:code/quote-snapshots/:id/confirm-order`: validate the exact frozen quote and order contracts, atomically persist acceptance + order. Repeated calls reuse the existing acceptance/order identities. Assembly retains its existing exact-version accept command, now with the validation/persistence transaction; an already accepted response carries the existing order for navigation.
- `POST /api/jobs/:id/production`: an Owner command for products and assemblies. An immediate SQLite transaction prepares/reuses the frozen production release and its execution plan together. A plan-write failure rolls back a newly created release; a historical release without a plan can be retried. Successful entry does not start any task.
- Domain readiness, eligibility, material modes, financial scoping and organization isolation remain server-owned. Incomplete estimates, inventory adoption and allocation of every future operation are not new prerequisites. New commands and their legacy mutation counterparts enforce the same Owner policy.
- Frozen quotes, orders, production snapshots, plan/task IDs and history remain intact. No migration or business-record deletion is part of this change.

## Member price persistence

A technical confirmation may precede the manual customer price. Confirming a price must attach an immutable commercial revision of that member to its assembly, even when the technical hash is unchanged. Previous member records and frozen quotes/orders remain unchanged. Repeating the same price reuses its stored revision; technical-only reconfirmation retains the current assembly's accepted price. Ordered assemblies remain read-only.

The configurator acknowledges success only after the assembly member save succeeds and returns the matching assembly/role with its saved commercial projection. Save failures preserve the draft and are visible in the commercial work area. Freeze refusals identify the unpriced member roles. This corrects the E2E audit blocker found after the initial PR #92 candidate; it does not merge technical readiness with commercial pricing or internal costing.

## Retirement map

| Historical entry | Replacement |
| --- | --- |
| `/planificare` and `PlanningPage` | Optional resource view in Lucrări; no separate navigation entry or page |
| `/executie/:planId` and engine `/execution/:planId` | Replace-history redirect to Atelier, preserving plan, task and job |
| Job `sectiune=plan` or `operatie` | `sectiune=operatii`, preserving task |
| Job `sectiune=fisiere` or `materiale` | `sectiune=documente`, preserving task |
| Job `sectiune=sursa` | Situation with source disclosure anchor |
| `ExecutionPage` wrapper | Shared `OperationWorkspace` inside Atelier |
| `JobTaskWorkbench` dossier/forms | Shared `TaskDossierPanel` in sheet and Atelier |

Emit canonical URLs from frontend builders, workload API and domain inbox/job links. Keep alias handling only in routing/return sanitization. Do not restore retired page wrappers or add another dossier mutation form. Keep optional API compatibility endpoints for existing clients; the UI uses coordinated commands.

An invalid explicit task must show an error and recovery choice; never silently select another task. Selecting, opening, filtering or identifying never starts work. Task drafts survive section/list toggles within the mounted workspace; they are not durable cross-device drafts. Account, organization and operator boundaries reset dossier drafts.

## Review and remaining boundary

Automated synthetic checks cover command retries/rollback, product/assembly parity, Owner/tenant boundaries, aliases, selected task and draft continuity. Cursor reported a complete UI journey at `0dbb6b9` on the same isolated synthetic audit assembly: quote frozen, one order, production finished at 17/17 operations and retained after reload. This is reported runtime evidence for that commit, not independent browser or visual acceptance. Delivery and installation remain separate.

The follow-up correction keeps an operation's lifecycle separate from machine occupancy. Multiple operations may be open; one machine may have only one open MachineRun across all jobs in an organization's operational plane. The domain checks occupancy and the persistence command reads it and inserts the run under one immediate transaction. A busy machine returns `machine_busy` / HTTP 409 with a retry explanation. Stopping its run releases occupancy; no scheduling calendar, automatic task completion, schema change, historical backfill or workcenter exclusivity is introduced.

Operator identification/logout and People administration refresh cached execution plans as well as the inbox, so viewer-dependent eligibility is reread without page reload. The sheet describes the absence of current activity without claiming that no operation ever started.

Cursor reported A/B/C PASS on `868d617`: finished-job wording, eligibility after identification/People changes, and same-machine run exclusion/release. No screenshots were available and a session-expiry observation remains unresolved. That runtime report is separate from the pending validation of the subsequent resource-view change. Tests/build are not visual evidence. Multi-worker participation and automatic work/pause intervals require their own state-machine work and are not introduced here. File upload was not exercised in the reported journey. The phone table overflow observation remains a visual review advisory.
