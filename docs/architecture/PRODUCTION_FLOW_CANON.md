# Production entry and workspace ownership

Candidate authorized by the Owner on 2026-10-20 in `office952/workos-po`. Built on `184619c` / draft PR #91. This changes source and navigation; it does not authorize merge, deployment, real data operations or claim visual acceptance.

## One active experience per responsibility

| Experience | Responsibility | Canonical location |
| --- | --- | --- |
| Offer | Review one frozen version; **Confirmă comanda** records acceptance and creates/retrieves its order, then opens its job | Existing product / assembly offer URL |
| Job sheet | Coordinator: situation, operations with selected dossier, documents/materials, results | `/lucrari/:jobId` with `sectiune=situatie`, `operatii`, `documente`, `rezultate` |
| Atelier | Operator identification, eligible inbox, selected operation and execution commands in one workspace | `/atelier?job=…&plan=…&task=…` (job optional) |
| Planning | Optional cross-job workload and allocation; never a prerequisite for production entry | `/planificare` |

Commercial source and lifecycle history are disclosure details in Situation. Files and material preparation are sections of the existing sheet, not new pages. Operation identity, instructions and files identify the work; they do not teach the trade.

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

Browser validation of the follow-up correction remains required via the local Cursor runtime. Tests/build are not visual evidence. Multi-worker participation and automatic work/pause intervals require their own state-machine work and are not introduced here. File upload was not exercised in the reported journey. The phone table overflow observation remains a visual review advisory.
