# Production entry and workspace ownership

Candidate authorized by the Owner on 2026-10-20 in `office952/workos-po`. Built on `184619c` / draft PR #91. This changes source and navigation; it does not authorize merge, deployment, real data operations or claim visual acceptance.

## One active experience per responsibility

| Experience | Responsibility | Canonical location |
| --- | --- | --- |
| Offer | Review one frozen version; **Confirmă comanda** records acceptance and creates/retrieves its order, then opens its job | Existing product / assembly offer URL |
| Job sheet | Coordinator: one job route with six exclusive sections — Situație, Operații, Fișiere, Oameni, Istoric, Date lucrare — and one shared operation dossier | `/lucrari/:jobId`; `sectiune` selects the only visible section; an explicit task opens that operation inside Operații |
| Atelier | Operator identification, eligible inbox, selected operation and execution commands in one workspace | `/atelier?job=…&plan=…&task=…` (job optional) |
| Work by resource | Optional cross-job operations grouped by machine/zone; manual work and real resource gaps remain visible | `/lucrari?vedere=utilaje` |

The job sheet keeps one route. Its current presentation is six exclusive sections, described in [Owner decision: exclusive job-sheet sections](#owner-decision-exclusive-job-sheet-sections-2026-10-21). The long page with anchors recorded later in this file is the earlier wave, not the current organization. Material preparation, technical context and the commercial source stay in Date lucrare. Operation identity, instructions and files identify the work; they do not teach the trade.

## Owner decision: planning without repetitive administration (2026-10-20)

Direction accepted by the Owner; implemented as a source candidate on PR #92. Local runtime and visual validation of this presentation change remain pending.

- The coordinator sends the entire job to production once. Release generates its operation graph; the coordinator does not have to authorize or start each operation separately.
- The operator records the actual beginning of work. Readiness, dependencies and eligibility remain server-owned; releasing the whole job must not mark every operation as started or bypass required gates.
- Manual duration estimates are optional and must not become a production prerequisite or a repeated missing-data warning. Measuring real work, including the separately scoped participation/interruptions capability, is the priority. Unknown estimates remain unknown; do not fabricate them from cost rates or quantities. Any future suggestions from comparable history need their own validated contract.
- Planning is retired as a primary workflow page in favor of the optional cross-job **Pe utilaje și zone** view inside Lucrări. The existing workload engine and historical estimates are retained; `/planificare` redirects with history replacement to `/lucrari?vedere=utilaje`. `PlanningPage` and its stylesheet are replaced by the embedded `JobsWorkload`, not kept as parallel pages.
- A single eligible physical provider requires no repetitive manual choice. The current execution auto-binding remains authoritative; workload presentation must distinguish automatic selection from a real missing resource or a choice between multiple providers. Do not guess provider eligibility in the frontend.
- Replace misleading per-task administrative actions such as **Alocă în execuție** with actions that describe the actual remaining choice or simply open the operation.

The default resource view shows open operations, their job/customer context and server-owned resource explanations. Estimates and their editor appear only after explicit optional disclosure; missing estimates are not routine warnings. A unique eligible provider is a projected queue target, visibly awaiting automatic binding, not a persisted assignment or a start event. Manual operations without a required provider stay visible in their own group. Genuine choices and missing providers remain actionable exceptions. Opening, searching and switching views never writes assignment/start commands; drafts and the registry search survive view switching within the mounted registry.

The resource-view wave did not introduce multi-worker timing. The later approved job-record wave below adds individual work sessions. Neither wave authorizes merge, deployment or real-data changes.

### Resource-view runtime review and keyboard follow-up (2026-10-21)

Cursor reported the main resource-view behaviors passing at `fd5de5e`: integrated navigation and historical redirect, estimates optional by default, unique-provider projection without starting work, optional estimate draft continuity, and the finished audit job unchanged. Search survives switches between the two mounted registry views; losing it after leaving for Start is within the current contract. Manual-only work was observed; the fixture did not contain a genuine missing-provider or multiple-choice case. No screenshots were available. The keyboard/focus check remained partial, so this is not visual or accessibility acceptance.

The focused follow-up uses an explicit disclosure button with `aria-expanded`; closed settings are not rendered as accessible or focusable controls. The resource view and its navigation links have visible keyboard-focus styles. Automated interaction checks cover Tab, Shift+Tab, Enter and Space without posting task mutations. Local browser verification of this correction remains pending; it does not change business data, eligibility, estimates or their persistence.

## Coordinated server commands

- Product `POST /api/products/:code/quote-snapshots/:id/confirm-order`: validate the exact frozen quote and order contracts, atomically persist acceptance + order. Repeated calls reuse the existing acceptance/order identities. Assembly retains its existing exact-version accept command, now with the validation/persistence transaction; an already accepted response carries the existing order for navigation.
- `POST /api/jobs/:id/production`: an Owner command for products and assemblies. An immediate SQLite transaction prepares/reuses the frozen production release and its execution plan together. A plan-write failure rolls back a newly created release; a historical release without a plan can be retried. Successful entry does not start any task.
- Domain readiness, eligibility, material modes, financial scoping and organization isolation remain server-owned. Incomplete estimates, inventory adoption and allocation of every future operation are not new prerequisites. New commands and their legacy mutation counterparts enforce the same Owner policy.
- Frozen quotes, orders, production snapshots, plan/task IDs and history remain intact. The original production-entry wave had no migration or business-record deletion. The later participation wave adds migration 046 without rewriting existing tasks.

## Member price persistence

A technical confirmation may precede the manual customer price. Confirming a price must attach an immutable commercial revision of that member to its assembly, even when the technical hash is unchanged. Previous member records and frozen quotes/orders remain unchanged. Repeating the same price reuses its stored revision; technical-only reconfirmation retains the current assembly's accepted price. Ordered assemblies remain read-only.

The configurator acknowledges success only after the assembly member save succeeds and returns the matching assembly/role with its saved commercial projection. Save failures preserve the draft and are visible in the commercial work area. Freeze refusals identify the unpriced member roles. This corrects the E2E audit blocker found after the initial PR #92 candidate; it does not merge technical readiness with commercial pricing or internal costing.

## Retirement map

| Historical entry | Replacement |
| --- | --- |
| `/planificare` and `PlanningPage` | Optional resource view in Lucrări; no separate navigation entry or page |
| `/executie/:planId` and engine `/execution/:planId` | Replace-history redirect to Atelier, preserving plan, task and job |
| Job `sectiune=plan`, `operatie` or `rezultate` | `sectiune=operatii`, preserving task. Results live in the operation detail |
| Job `sectiune=documente` | `sectiune=fisiere`, preserving task |
| Job `sectiune=fisiere` | Fișiere, already canonical |
| Job `sectiune=materiale` or `sursa` | `sectiune=date`, preserving task |
| `ExecutionPage` wrapper | Shared `OperationWorkspace` inside Atelier |
| `JobTaskWorkbench` dossier/forms | Shared `TaskDossierPanel` in sheet and Atelier |

Emit canonical URLs from frontend builders, workload API and domain inbox/job links. Keep alias handling only in routing/return sanitization. Do not restore retired page wrappers or add another dossier mutation form. Keep optional API compatibility endpoints for existing clients; the UI uses coordinated commands.

An invalid explicit task must show an error and recovery choice; never silently select another task. Selecting, opening, filtering or identifying never starts work. Task drafts survive section/list toggles within the mounted workspace; they are not durable cross-device drafts. Account, organization and operator boundaries reset dossier drafts.

## Review and remaining boundary

Automated synthetic checks cover command retries/rollback, product/assembly parity, Owner/tenant boundaries, aliases, selected task and draft continuity. Cursor reported a complete UI journey at `0dbb6b9` on the same isolated synthetic audit assembly: quote frozen, one order, production finished at 17/17 operations and retained after reload. This is reported runtime evidence for that commit, not independent browser or visual acceptance. Delivery and installation remain separate.

The follow-up correction keeps an operation's lifecycle separate from machine occupancy. Multiple operations may be open; one machine may have only one open MachineRun across all jobs in an organization's operational plane. The domain checks occupancy and the persistence command reads it and inserts the run under one immediate transaction. A busy machine returns `machine_busy` / HTTP 409 with a retry explanation. Stopping its run releases occupancy; no scheduling calendar, automatic task completion, schema change, historical backfill or workcenter exclusivity is introduced.

Operator identification/logout and People administration refresh cached execution plans as well as the inbox, so viewer-dependent eligibility is reread without page reload. The sheet describes the absence of current activity without claiming that no operation ever started.

Cursor reported A/B/C PASS on `868d617`: finished-job wording, eligibility after identification/People changes, and same-machine run exclusion/release. No screenshots were available and a session-expiry observation remains unresolved. That runtime report is separate from the pending validation of the subsequent resource-view change. Tests/build are not visual evidence. Multi-worker participation was outside those earlier runtime reports; its subsequent source candidate is described below. File upload was not exercised in the reported journey. The phone table overflow observation remains a visual review advisory.


## Owner-approved job record and participation (2026-10-21)

The Owner approved the scoped Figma direction and then authorized implementation in this existing GitHub repository. Session exception continues without Notion edits or a `NOTION_GATE=PASS` claim. Historical R-002 is not asserted as implementation coverage. No merge, deployment, real database mutation or final visual acceptance is included.

Approved review frames: [main job record](https://www.figma.com/design/M3Klzg7sulrtLSyxJBf3Vd/WorkOs-F?node-id=732-3), [sessions and incomplete hours](https://www.figma.com/design/M3Klzg7sulrtLSyxJBf3Vd/WorkOs-F?node-id=751-17). These frames are a scoped design decision; they do not reinstate a universal Figma authority. Example numbers in them are synthetic illustrations, never job evidence.

- One job page, with labeled icon anchors: files, hours, people, chronology. No four mutually exclusive sheet tabs. Historical section URLs still resolve on the same job; document/result aliases scroll to the visible corresponding section. An explicit task opens the reused `TaskDossierPanel`. Invalid task IDs remain errors. No task is silently selected on page entry or after production release.
- File-first archive: one row per stored artifact/revision, exact downloads, uploader/time, and every linked operation. A link is not proof of use. Explicit `usedAt` / operator evidence identifies declared use. A later revision never inherits or replaces an earlier file's use evidence. No fabricated version numbering.
- `GET /api/jobs/:jobId/record` reads the already located organization's job/plan. It projects operational results, file associations, explicit uses, measured sessions, per-person totals and a unified chronology. No financial cost projection or per-task HTTP fan-out is introduced.
- Join/start and own leave are server commands. Eligible people may join an already running task, including operations with a machine; machine occupancy remains governed separately by MachineRun. Each person may have only one open personal work session in the organization's plane. An immediate transaction plus a partial unique index enforce this across tasks/jobs. Retries are idempotent.
- The first executor and original task start remain historical facts. Leaving closes only that person's interval; task status remains IN_PROGRESS and other workers continue. Another active participant prevents completion with a clear explanation. The last acting participant's interval closes atomically with successful ordinary completion or quality pass. Refused completion/quality fail does not close it. Machine-run completion guards remain in force.
- Retirement is refused while the person has an open session, including a joiner who is not the first executor. Losing a qualification does not remove the ability to leave one's session. Browser closure, logout or network loss never silently fabricate an exit time.
- Migration `046_execution_work_sessions.sql` only adds the session table and indexes. It does not backfill sessions or reinterpret `actualDurationMinutes`. Tests use isolated temporary databases. Applying it to a real organization requires its separate operational procedure.

### Meaning of each time total

| Display | Authoritative calculation |
| --- | --- |
| Recorded labor hours | Sum of every person's session milliseconds; simultaneous people add separately |
| Recorded active time | Union of those intervals; overlap counts once |
| Beginning to end | First task start through last task completion, or report read time while unfinished; includes interruption/waiting |
| Machine time | Sum of closed MachineRuns from their timestamps; active runs are explicitly excluded and signaled |
| Declared duration | Existing manual actualDurationMinutes, displayed separately; never treated as measured labor |

Timestamp precision is retained until display rounding. Coverage is complete only when every internal operation is completed, tracked from its original start and has no open sessions. Late joining to an older task remains partial. Missing labor stays unrecorded, never zero. Active sessions are provisional, with an explicit report timestamp. External-only work is marked not applicable for internal labor. CSV exports the same server-projected values, with spreadsheet-formula escaping.

### Separate evidence signals (2026-10-21)

The hours projection carries three independent signals per operation, additively next to the existing fields and formulas:

| Field | Meaning |
| --- | --- |
| `activeSessionCount`, `provisional` | Open personal sessions; their time is provisional until exit or completion |
| `undocumented`, `evidenceGap`, `evidenceGapLabel` | A canonical gap only: a recorded start with no personal session at that start (`UNTRACKED_START`), or recorded start/completion with no personal session at all (`NO_INDIVIDUAL_SESSIONS`) |
| status `IN_PROGRESS` without open sessions | In progress, nobody active; job-level `idleTaskCount` |

They can coexist on one operation. An unfinished operation, a pause, or the distance between two moments is never treated as missing work, and a gap names no person. Job level adds `activeSessionCount`, `provisionalTaskCount`, `undocumentedTaskCount` and `idleTaskCount`. `complete`, `completeTasks` and every total keep their formulas. Labels change only where they were misleading: an unstarted operation reads `Neîncepută`, a tracked interrupted one `În lucru · fără sesiuni active`, and a job's open-session label also says `evidență parțială` when a gap exists. No table, endpoint or retroactive timekeeping is added.

The existing finished audit job remains an archive, with its operations, files and available history accessible. Production completion does not assert delivery or installation. Historical quantities, material consumption, declared durations, snapshots and file bytes remain intact. Operator UI records participation automatically; no manually entered task estimate or duration is required.

### Retired presentation and remaining review

`JobOperationPlan` and `JobOperationFiles` were unreferenced after replacing the sheet and are removed with their isolated old layout tests. They are not kept as alternate active pages. Existing Atelier, dossier, material and artifact preview implementations are reused. `/planificare` remains the existing redirect; the Owner stopped further development of the optional resource view, so this wave does not refine it.

Corrections of mistakenly left-open personal sessions, auditable time amendments, richer transport/delivery/montage lifecycle, history-based production pricing, and durable cross-device drafts are separate future contracts. Do not pretend those capabilities already exist. Local Cursor review must exercise actual joins/leaves, file upload/use/revision and responsive/keyboard presentation on the exact new source. Earlier 17/17 commercial E2E evidence is not transferred to this wave. Automated checks and the approved Figma frames are not final product visual acceptance.


### Source verification for the job-record wave

- Frontend full suite: 698 tests passed; focused follow-up covers the record, explicit operation focus, production navigation, dossier and Atelier.
- Domain full suite after external-only time coverage: 109 files / 775 tests passed, including overlapping people, repeated entries, subminute aggregation, legacy partial coverage and external handoff elapsed time.
- API full functional run excluding three environment-blocked files: 105 files / 602 tests passed. The initial full API run also passed 48 tests within those three files; their three remaining child-process tests fail identically on the untouched 4bfcf183 snapshot. The sandbox refuses the tsx IPC pipe / child worker produces no result. Those infrastructure tests are not declared PASS.
- Typecheck, lint and build frontend/domain/API pass. The 13 existing Fast Refresh warnings and the existing >500 kB frontend chunk advisory remain.
- Read-only independent source review found no remaining concrete publication blocker. Selected operation focus, current quality/rework state, correction closure, planned/actual quantity/consumption, record timestamp/refresh and retirement/session safety were checked. This is source review, not browser acceptance.
- Browser connection was unavailable in this session. No screenshots, responsive visual PASS, live two-worker UI E2E PASS or final Owner visual acceptance are claimed. Cursor must verify the published source on the existing isolated synthetic preview.

## Owner decision: exclusive job-sheet sections (2026-10-21)

This decision replaces the long-page anchor organization, including frames 732:3 and 732:5. The paragraphs above remain the record of that wave. It does not change the record API, participation, machine exclusivity, eligibility, server totals, schema or the **Pe utilaje și zone** view.

The same route `/lucrari/:jobId` has six sections: Situație, Operații, Fișiere, Oameni, Istoric and Date lucrare. The section bar is shared with the job identity. Choosing a section shows only that section to pointer and keyboard. Historical `sectiune` values resolve on this route; they do not open a second page. A missing section opens Situație. An explicit task without a section opens Operații.

Situație shows state, progress, beginning, end, calendar duration, labor and machine time. Incomplete evidence stays explicit. It does not repeat the full operation list. Operații is the only full register: the row identifies the operation, state, participants and hours; the detail directly under that row holds results, quantities, consumption, control, sessions and the existing dossier. One detail is open at a time. Closing returns focus to the row control. An invalid task id is an error and does not select another operation. Unsaved dossier drafts survive collapse and section changes in the current session, and reset when the operator, organization or job changes. The separate results renderer is retired.

Fișiere keeps revisions, uploader and time, and the difference between association and declared use, including exact-version download. Oameni shows each person's contribution and sessions, with links to operations and without repeating the plan. Istoric groups events by day. Date lucrare keeps estimated need, checks and actual consumption distinct, together with technical/install context and the commercial source.

A finished job is a consultation record: results, people, hours, files, history, download, export and print. Print lays out every section and the operation results already present on the job record, including collapsed rows. It omits interactive commands and unsaved drafts, and returning from print does not change the open section, selection, scroll or drafts. It does not request each operation dossier. Priority and deadline stay historical information. The sheet does not prompt preparation or production start, and it does not phrase supply or verification as the next production step. Permitted dossier additions stay distinct from execution and keep their author and time. **Producție finalizată** does not confirm delivery or installation. Missing hours stay unrecorded.

Owner-requested references for composition, hierarchy and density, as well as shared identity and stable navigation: [Situație](https://www.figma.com/design/M3Klzg7sulrtLSyxJBf3Vd/WorkOs-F?node-id=710-1116), [Operații](https://www.figma.com/design/M3Klzg7sulrtLSyxJBf3Vd/WorkOs-F?node-id=710-1277), [Fișiere](https://www.figma.com/design/M3Klzg7sulrtLSyxJBf3Vd/WorkOs-F?node-id=715-1271). Their example data, older section names and business rules are not imported.

The follow-up candidate keeps the six exclusive sections. Situation retains server-provided totals and shows links to in-progress operations. Operations uses one searchable register; quantity variance is under quantities, separate from quality control. People uses session tables with entry, exit and duration, plus server-provided totals. History uses compact events grouped by day. Files keeps declared use and revisions, with direct download; general files are offered in an explicit association action within an operation instead of repeating the archive by default. Atelier retains the shared dossier's default presentation. No API, engine, schema or execution-policy change belongs to this follow-up. Print/PDF redesign remains out of scope. Browser fidelity and Owner acceptance are pending; source checks do not establish visual acceptance.

