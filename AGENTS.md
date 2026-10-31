# WorkOS PO agent contract

## Repository identity

This repository is:

`office952/workos-po`

If the working repository is not exactly that:

**STOP.**

Do not continue implementation, commit, or push until the working tree is the WorkOS PO repository.

```text
ONE_PRODUCT_REPOSITORY = office952/workos-po
CANONICAL_PRODUCT_REPOSITORY = office952/workos-po
```

## Authority

```text
PRESENTATION_AUTHORITY = workos-po root frontend
BUSINESS_ENGINE_AUTHORITY = workos-po/apps/api + workos-po/packages/domain
PERSISTENCE_IMPLEMENTATION_AUTHORITY = workos-po/apps/api
SOURCE_CODE = workos-po
REAL_BUSINESS_DATA = external persistent WorkOS data root / Operational Planes
```

Future WorkOS development happens here unless a later explicit Owner decision changes repository strategy.

```text
WORKOS_FINAL_CONTINUING_AUTHORITY = NO
WORKOS_UI20_CONTINUING_AUTHORITY = NO
```

`office952/workos-final` is historical/reference at `084ddebb`.
`office952/workos-ui20` is historical/reference at `9446b6d`.

Do not import or synchronize future WorkOS business changes from `workos-final` by default.
Do not silently fast-forward the frontend from a later UI20 commit.
Do not import Final `apps/web`.
Do not use Pass A reconstruction as the frontend source.

Never commit WorkOS PO work to `workos-final` or `workos-ui20`.

```text
workos-final != workos-po
workos-ui20 != workos-po
```

## Hard boundary

The preserved root frontend is the only UI.

There is one business engine: the packages in this repository. Do not maintain a second active engine in `workos-final`.

```text
NO PARALLEL PRODUCT TRUTH
NO SECOND PRICING ENGINE
NO SECOND EXECUTION ENGINE
NO CLIENT-SPECIFIC CODE FORK
```

## Forbidden duplication

Never copy or independently implement in the frontend, and never create a second owner of:

- pricing formulas
- technical formulas
- ProductDefinition
- Product Truth
- Quote engine
- Order engine
- Production Release engine
- execution state machine
- eligibility logic
- business readiness logic
- database schema

## Integration rule

```text
WORKOS PO API
→ typed transport contract
→ adapter
→ presentation model
→ UI
```

Never:

```text
UI → duplicated business calculation
```

UI may code experience: layout, reusable components, interaction, responsive behavior, generic renderers.

UI must not hardcode business truth: product fields, materials, formulas, pricing, costs, readiness, dependencies, module activation, business statuses, totals, commercial flows, or Product Truth.

The root frontend must not import `@workos-final/domain`.

## Data

Real business data is external. It must not live in Git. `WORKOS_CLOUD_ROOT` remains external persistent storage.

Copying the engine did not copy or migrate real customer data.

## Language

- Operator-facing UI: Romanian
- Code / internal identifiers: English permitted

Normal operator UI does not expose internal jargon: hashes, DTO names, raw codes, service names, compiler vocabulary, raw provenance, debug objects, or internal JSON.

## UI/UX authority

Current policy: `docs/architecture/WORKOS_UIUX_AUTHORITY_CURRENT.md` (Owner update 2026-10-31).

**WorkOS-N is the single active Figma design workspace**: https://www.figma.com/design/rM71g74Ph0mkAjAtWuLahy/WorkOS-N (`rM71g74Ph0mkAjAtWuLahy`). For substantial new UI/UX changes, design and refine first in the relevant existing WorkOS-N page/section, secure scoped Owner design acceptance, then implement in the root frontend and prove Figma-to-browser parity. Do not create new Figma files or pages by default; preserve existing accepted and historical frames. A concept is not an approved design.

Product Truth stays in `apps/api` and `packages/domain`; the root frontend remains the presentation implementation. Figma does not own business contracts, permissions, pricing or execution. Historical WorkOs-F and other Figma files are not reinstated as live design authority. Prior mandatory palettes and visual prescriptions remain retired.

Structural rules that stay:
- one SaaS product and one business engine;
- modular stylesheets, with no new major surface adding bulk to `src/styles/ui.css` (`docs/architecture/WORKOS_UI_STYLE_ARCHITECTURE_V1.md`);
- accessibility, visible focus, keyboard use, and responsive layout that keeps the primary task readable;
- traceable operator actions and runtime browser evidence;
- no replacement component library or styling framework without explicit Owner GO.

## WorkOS-N design writer: Claude app

Owner decision (2026-10-31): **Claude app is the author/editor of Figma UI/UX designs in WorkOS-N**. ChatGPT owns product/design coordination, brief preparation, read-only independent review and checking Figma-to-browser evidence. Cursor implements scoped Owner-accepted designs in `office952/workos-po`; it does not become the default Figma drawing agent. Owner accepts specific design frames and subsequent integration separately.

New ChatGPT chats and Cursor Agents must carry this role separation forward. Do not draw/edit in Figma through ChatGPT/Cursor by default or create competing files/pages. If Claude design execution is unavailable, mark a dependency and ask for an Owner decision rather than silently reassigning its role. See `docs/architecture/WORKOS_UIUX_AUTHORITY_CURRENT.md` and [Owner design decision](https://app.notion.com/p/40a8ea98e40f8165b7d7e7df523d805a).

## Mandatory reuse and demo continuity gate

Before authoring or executing any substantial WorkOS UI/UX task, **STOP until the continuity preflight in** `docs/architecture/WORKOS_UIUX_AUTHORITY_CURRENT.md` is satisfied. The reviewer must verify the existing WorkOS route, WorkOS-N Figma page/section, and relevant persistent synthetic scenarios (N-019 workshop, N-020 client dossier, N-028 Alpha Clima copy) against actual local roots, backups and branch/schema compatibility. Never infer running services from recorded ports.

Do **not** start another Figma file/page, duplicate application surface, new persistent dataset or clean demo by default. A temporary minimal fixture may cover an isolated regression but does not replace realistic positive E2E browser proof. Protect all original demo roots and real data; use an expressly authorized isolated compatible copy for mutating tests, not reset/reseed/migrate-in-place. If the rich scenario is incompatible or inaccessible, record a HOLD and the smallest safe recovery plan; do not invent data or count a tiny fixture as full UX acceptance.

The coordinating independent review checks this gate before giving Cursor a GO or an acceptance verdict. Link the actual verification in the existing PR/Notion journal; no new documentation workstream is required. Owner continuity decision: https://app.notion.com/p/40a8ea98e40f812cac6cf929dad44f5a.

## N-028 persistent demo: Owner-authorized synthetic login only

Owner decision 2026-10-31: [N-028 operating policy](https://app.notion.com/p/4088ea98e40f81268195cbe280899e5c). `%LOCALAPPDATA%\WorkOS\demo-alpha-current-main` is the **existing reusable synthetic review environment**. For read-only UI/UX review, **normal login/session creation by an already existing authorized synthetic user is permitted** on N-028's **control-plane only**, including necessary re-authentication after normal session expiry. This scoped Owner approval persists across ChatGPT/Cursor chats; no repeated GO is needed solely for session expiry. It does NOT reclassify N-028 business data as mutable.

Before login: reverify local root, organization, process lease, actual API, frontend-to-API compatibility, unchanged product DB/schema and authorized synthetic identity. Credentials/session tokens must never appear in prompts, files or logs. Do not bypass authentication or create/reset users to obtain access. Monitor the expected control-plane session delta and unchanged product DB after the read-only walk. STOP if unexpected writes, ambiguous identity, missing safe credentials or extra mutations are required.

Forbidden under this standing exception: product/business data changes; adding clients, jobs, tasks or files; schema migration 050 or any migration; seed/restore/copy as a default; account/permission changes; organization switching; automatic logout or session revocation; modification of any N-019/N-020/Hyperreview/backup original; real Cloud; code/Figma writes or merge. Any of these needs its own scoped Owner GO.

For frontend-only changes, first reuse the running N-028 API via the existing `WORKOS_API_PROXY_TARGET` where compatible; do not launch a newer API against N-028 and accidentally auto-migrate it. The latest R-005 status is in the [existing R-005 checkpoint](https://app.notion.com/p/40a8ea98e40f81d7ad0bedadc3d744e7); reverify current task and PR before proceeding.

## Owner-controlled pause when changing Cursor folders

**Owner instruction (2026-10-31): never rush a workspace/folder change.** Opening a different checkout, Cursor window, Agent chat or native worktree is a distinct **human-controlled handoff**, not a side effect of pasting a prompt. Before any change of workspace:

1. Coordinator gives the Owner the **exact existing folder to open**, its task/repository role, whether to continue the same verified Agent or start a New Agent, and what existing work/processes must remain untouched. If a native `/worktree` will be created, identify the verified parent checkout but never guess the generated path.
2. **STOP and wait for the Owner to change/select the folder in Cursor and explicitly confirm readiness.** Do not issue instructions that presume the switch has already happened. Do not impose time pressure or auto-advance after a progress report.
3. After that confirmation, run a fresh **Cursor location + Git identity gate**: Cursor workspace root, `git rev-parse --show-toplevel`, `origin`, branch/detached state, HEAD, origin/main, merge-base, worktree status and `CURRENT_CHAT_ROOT_MATCHES_GIT_TOPLEVEL`. For native worktrees, apply PRE- and POST-worktree gates.
4. Continue only when `OWNER_FOLDER_READY = YES` and `SAFE_TO_CONTINUE = YES`. If either is absent or mismatched, STOP and show evidence. The Owner controls the next handoff action.

Never treat a textual path, screenshot, Cursor sidebar label, shell `cd`, or process port as proof that the Agent is attached to the intended repository. Never silently rebind by checkout/reset/stash, `move_agent_to_root`, or continuing the old Agent after a manual root switch. For a manual folder change use **File > Open Folder** in the intended Cursor window and a New Agent, then verify. This pause is mandatory for future chats/Agents even if previous worktree identities were verified; it does not require re-opening folders for read-only review of already delivered reports.

## Mandatory image evidence folders and exact file locations

**Owner decision (2026-10-31): every set of WorkOS screenshots, visual comparisons or reported images MUST be saved as real files in its own dedicated evidence folder, and the report MUST state the verified absolute Windows path to the folder and to each individual image.** A sentence such as "screenshots are ready" without resolvable files and exact paths is NOT evidence completion.

After verifying the correct Cursor Agent/root, use the existing Git-ignored `evidence/` directory (confirmed in `.gitignore`) with one distinct, Windows-safe folder per **task + capture run**, e.g. `<ACTUAL_VERIFIED_GIT_TOPLEVEL>\\evidence\\R-005\\<YYYYMMDD-HHMMSS>-memory-responsive\\`. The path shown here is a **template**, not proof of an existing directory. Resolve the full real drive/path on Windows from the verified root and **create the per-run folder before capturing**. Do not reuse or overwrite images from another run. Store screenshot sets/exports, `manifest.json` or `manifest.md`, and optionally a review ZIP inside that set folder; preserve files until Owner review. For an ephemeral worktree scheduled for deletion, copy/archive the evidence to a separately Owner-approved durable location first and report both actual paths. Never store images in protected N-019/N-020/N-028 data roots or backups, or commit screenshots/secrets to Git.

Each report with images must include:
- `EVIDENCE_SET_ID`, `EVIDENCE_FOLDER_ABSOLUTE_WINDOWS` and `EVIDENCE_FOLDER_EXISTS=YES/NO`;
- `MANIFEST_ABSOLUTE_WINDOWS`, verified image count, and **every** `IMAGE_ABSOLUTE_WINDOWS_PATH` (not relative names alone), labeled by route/state, viewport pixel dimensions, theme, capture time and SHA-256 where possible;
- `FILES_VERIFIED_ON_DISK=YES/NO`, plus the archive absolute path if one was created and privacy/sensitive-content checks before sharing.

A reported capture that only exists in a browser/temporary tool or whose full file path cannot be verified is **`EVIDENCE_NOT_PERSISTED`**, not PASS; say so and do not invent paths or claim a folder exists. Report explicit absolute paths for other generated review artifacts too (reports, logs, ZIP/PDF), not just images. The evidence folder is a data-output location inside the **already-verified** checkout, **not** a reason to change Cursor workspace. Folder-switch Owner pause/identity gates remain mandatory whenever changing the actual workspace.

## New chat / Agent handoff gate (WorkOS)

**Changing ChatGPT conversations, Cursor chats, Agents, machines or checkouts does not reset the WorkOS project.** At the first substantial response in a fresh session, the coordinating reviewer MUST perform a **cold start** before supplying an implementation prompt, announcing acceptance or starting new UI/data work:

1. Prove the actual repository / branch / HEAD / checkout identity. Read the current `AGENTS.md`, `docs/ROADMAP.md`, `docs/SOURCE_OF_TRUTH.md` and the applicable domain/UI policy. Check the open PR and Notion decision/implementation journal for the **specific ongoing task**, not merely the latest conversation.
2. Determine **what is integrated on main, implemented only in a Draft PR, Owner-accepted, unaccepted or blocked**. A passing CI is not integration or Owner acceptance. Reconcile any conflicting old report or chat summary against current GitHub/Notion evidence.
3. For any UI/UX, real-data or synthetic-runtime task, apply the mandatory reuse preflight above **before** proposing a new Figma file/page, dataset, copy, startup or migration. WorkOS-N remains the single design workspace even when a candidate branch predates this policy. If the governance PR is not yet merged, read its current Draft and the [Owner decision](https://app.notion.com/p/40a8ea98e40f812cac6cf929dad44f5a), rather than assuming main already includes it.
4. Present a compact `SESSION_RESUME` showing verified current objective, current PR/HEAD, last accepted outcome, existing reusable assets, outstanding evidence/risks, prohibitions and **one** next step. If evidence is unavailable, report `RESUME_HOLD`; never guess and do not ask the Owner to reconstruct the entire project history.

**Before ending or handing off a substantial session**, update the **existing task's** Notion implementation/review journal and its open PR (when applicable), not a new planning document. The checkpoint must contain:

```text
SESSION_CHECKPOINT_VERSION = 1
LAST_VERIFIED_AT =
CURRENT_OBJECTIVE =
CANONICAL_REPOSITORY / BRANCH / HEAD / PR =
OWNER_ACCEPTED_VS_IMPLEMENTED_VS_INTEGRATED =
EXISTING_FIGMA_WORKOS_N_PAGE_AND_FRAME =
REUSABLE_SYNTHETIC_ENVIRONMENTS / SCHEMA / API_COMPATIBILITY =
VERIFIED_TESTS_AND_BROWSER_EVIDENCE =
OPEN_BLOCKER_AND_STOP_REASON =
PROTECTED_DATA_AND_FORBIDDEN_MUTATIONS =
NEXT_SMALLEST_SAFE_ACTION =
OWNER_GO_REQUIRED_FOR =
SOURCE_LINKS =
```

The checkpoint is a **navigation and decision handoff**, not a second Product Truth or replacement for live Git/Notion/Figma/runtime verification. Do not store secrets, credentials, real customer data or hardcoded temporary local ports as canonical truth. ChatGPT is responsible for checking this continuity chain; never presume a new chat automatically inherited all prior turns. Owner should need at most to say **"Continuam WorkOS"** when these connected project sources are available.

## Session change and continuity

A new ChatGPT chat or Cursor Agent is NOT a new WorkOS project. Before any new implementation prompt, the coordinator must verify the current repository and Git identity, read this AGENTS contract, the living roadmap, relevant Notion task journal and open PR, and identify existing WorkOS-N design and persistent N-019/N-020/N-028 synthetic data. Do not assume a new chat inherited earlier discussions, and do not accept an old summary as current evidence.

At the end of substantial work, update the existing task journal / PR with a small checkpoint: objective, branch/head/PR, current accepted-versus-Draft status, reusable Figma and data assets, actual runtime compatibility, unfinished proof, prohibitions, and the next authorized action. At the beginning of a new chat read that checkpoint and independently recheck changing facts. If inaccessible, report a hold rather than redesigning or reseeding.

For frontend-only features, check whether the new frontend can reuse the existing API and protected demo data without launching a later API that would auto-migrate the database. Authentication may write a session even for read-only business views, so confirm permission before using an existing protected environment. The full UI/UX continuity policy is in `docs/architecture/WORKOS_UIUX_AUTHORITY_CURRENT.md`. Governance is currently proposed in Draft PR #113 until separately merged.

## Current flow and status

- Active responsibilities: `docs/architecture/REQUEST_CATALOG_CONFIGURATION_CANON.md`.
- Living implementation status and accepted history: `docs/ROADMAP.md`.
- Configuration-First architecture: `docs/architecture/WORKOS_CONFIGURATION_FIRST_CANON.md`.
- Catalog administers reusable product definitions; it does not require or create a customer/request.
- New request owns client/CUI intake, an enabled-product choice or `Momentan indecis`.
- Configurator owns instance facts and commercial preparation inside a request. It renders the server schema.
- Manufactured ACM support is a product/assembly member. A supplied site support is HostContext.
- Keep one active implementation and one canon per responsibility. Preserve frozen domain contract versions and historical reports as history; do not treat their old `CURRENT_PROGRAM`/GO flags as current authority.
- Do not claim full product-definition authoring, production readiness or visual acceptance when only a projection/candidate is delivered.

## Verification and integration

Use meaningful targeted tests first. For cross-surface changes, run frontend typecheck/lint/tests/build and engine typecheck/lint plus relevant domain/API tests. Material UI changes require browser inspection at relevant widths, including 768px, and clear synthetic-vs-real evidence.

`pnpm lint` covers the root frontend; `pnpm engine:lint` covers the API and domain. Do not weaken either to make a candidate pass.

One implementation writer per mutable scope. Keep source work on a scoped branch; integrate only to the level authorized in the session. Review the final diff and repository identity before commit/push. Tests or self-review do not authorize merge/deploy.

## Data and Owner gates

No production deployment, real Cloud access/write, business DB mutation, old-repo mutation or cutover without explicit Owner authorization.

No business database, ORM, migrations, seeds or destructive data operations without explicit Owner authorization. Existing automated tests use isolated synthetic databases; they do not authorize applying migrations/seeds to an Owner reference runtime or real business root.

Do not stop, reclaim ports, reset or repurpose the Owner reference runtime for proof. Real data must remain outside Git. Report exact candidate checks and unresolved limits; do not copy old acceptance as new proof.

## Mandatory Notion governance

**Owner-approved: Notion is the permanent journal for WorkOS past, present and future development.** Before any actionable planning, requirement change, implementation, docs/tests/config change, commit, push, PR, merge, deployment or migration, verify a durable record in the [WorkOS implementation registry](https://app.notion.com/p/cc42b70f86354dd7b08e6a00b4cb5156), with its stable ID, exact URL, scope and the separately applicable Owner GO. Log the result and evidence afterward. New scope means updating Notion **before** changing it.

Canonical procedure: [docs/governance/NOTION_JOURNAL_GATE_V1.md](docs/governance/NOTION_JOURNAL_GATE_V1.md). If the Notion record is missing, unverifiable, or Notion is inaccessible, **STOP BEFORE WRITE**. A PR must include its implementation record ID/URL. Neither a Notion entry nor this rule authorizes merge, real-data operations or deploy. Notion is for **development governance**, never a business-runtime dependency.
