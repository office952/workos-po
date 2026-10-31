# WorkOS UI/UX authority — current

Status: **OWNER-ACCEPTED DESIGN WORKFLOW** (2026-10-31). Applies to `office952/workos-po`.

Owner decision and implementation journal: https://app.notion.com/p/40a8ea98e40f8165b7d7e7df523d805a

This document supersedes the **Figma-not-required** decision of 2026-10-16 *only as to the active UI/UX design workflow*. It does not reinstate historical visual prescriptions or grant blanket approval to all existing design frames.

## One active Figma design workspace

```text
ACTIVE_FIGMA_FILE = WorkOS-N
ACTIVE_FIGMA_FILE_KEY = rM71g74Ph0mkAjAtWuLahy
ACTIVE_FIGMA_URL = https://www.figma.com/design/rM71g74Ph0mkAjAtWuLahy/WorkOS-N
DESIGN_FIRST_FOR_NEW_SIGNIFICANT_UIUX = YES
NEW_FIGMA_FILE_BY_DEFAULT = NO
NEW_FIGMA_PAGE_BY_DEFAULT = NO
WORKING_DESIGN_IS_NOT_OWNER_ACCEPTED = YES
```

WorkOS-N is the **single active file for designing and refining the WorkOS user experience**. Start with its existing pages, sections, components, frames and tokens. Prefer extending the relevant existing page or section; create a named scoped frame/state **within it** when genuinely needed. A new Figma page or another file is an exception requiring a separate, explicit Owner decision. Never overwrite accepted variants or historical comparisons merely to make room.

At the time of designation, WorkOS-N has pages for foundations, components, offers, the WorkOS client/request/offer/job family, interaction journeys and the client dossier. Their presence is *design evidence*, not automatic acceptance of every frame.

This decision does **not** authorize a redesign of every WorkOS route or migrating historical frames into WorkOS-N en masse. Existing separate R003-D/E and R-005 design files remain readable historical work; any future consolidation must identify the specific target page/section, provenance and Owner-approved scope.

## Design acceptance is explicit and scoped

Distinguish:

1. **Concept / exploration** — editable draft in WorkOS-N, not accepted as implementation fidelity authority.
2. **Owner-accepted variant** — specific frame(s), state(s) and behavior(s) accepted by the Owner for a named UI/UX scope.
3. **Implemented** — source in the root frontend of `workos-po`.
4. **Runtime-verified** — observed in the actual application using an authorized isolated synthetic runtime.
5. **Integrated** — reviewed code merged after a separate Owner merge authorization.

Record accepted Figma frame identifiers, relevant pages, behavior/states, scope and acceptance date in Notion and the implementation PR. Do not treat the entire Figma file, historical variants or a screenshot as implicitly accepted.

## Product authority is not Figma

```text
BUSINESS_ENGINE_AUTHORITY = workos-po/apps/api + workos-po/packages/domain
PERSISTENCE_IMPLEMENTATION_AUTHORITY = workos-po/apps/api
PRESENTATION_IMPLEMENTATION = workos-po root frontend
DESIGN_WORKSPACE = WorkOS-N / Figma
```

Figma decides the **proposed presentation and interaction**, not technical product truth. It never defines formulas, materials, quantities, cost rates, pricing, state transitions, task eligibility, permissions, customer data or persistence contracts. The root frontend is current implementation evidence; it is not automatically the aesthetic standard to replicate.

## Mandatory continuity and reuse preflight

**Before every substantial WorkOS UI/UX prompt, new Cursor Agent, design change or runtime review**, the coordinating reviewer must establish what already exists. This is an execution gate, not a request to create another planning document. Write the short result in the existing task/PR/Notion journal; the Owner must not have to rediscover prior work.

```text
CONTINUITY_GATE = PASS / HOLD
CANONICAL_REPO_AND_CURRENT_TASK =
EXISTING_ROUTE_COMPONENTS_AND_REUSABLE_CONTRACTS =
FIGMA_WORKOS_N_TARGET_PAGE_SECTION_AND_ACCEPTED_FRAMES =
PERSISTENT_SYNTHETIC_ENVIRONMENT_CANDIDATES =
DATA_SOURCE_SELECTED_AND_WHY =
SOURCE_ROOT_READONLY_VERIFIED =
CODE_SCHEMA_VERSION_AND_RUNTIME_COMPATIBILITY =
BACKUP_AND_NONDESTRUCTIVE_TEST_COPY_PLAN =
POSITIVE_REALISTIC_E2E_SCENARIO =
GAPS_REQUIRING_OWNER_DECISION =
```

Required discovery sources (use live evidence, not stale port assumptions):

- **Figma**: [WorkOS-N](https://www.figma.com/design/rM71g74Ph0mkAjAtWuLahy/WorkOS-N). Reuse the relevant existing design page, section, frames and components. A new Figma file/page or unrelated application/domain is **not** a default alternative.
- **N-019, persistent synthetic workshop**: [Notion registry](https://app.notion.com/p/4028ea98e40f81309b27e25b039e80c3); expected local root `%LOCALAPPDATA%\WorkOS\demo-atelier-n019`; exact workers, jobs, technical files and machine evidence subject to **current local read-only verification**. Its reproducible preparation mechanism remains in [Draft PR #97](https://github.com/office952/workos-po/pull/97), not automatically available on `main`.
- **N-020, client dossier synthetic scenario**: [Notion registry](https://app.notion.com/p/4028ea98e40f81d39351e3d4fc7887e8); original persistent root `%LOCALAPPDATA%\WorkOS\demo-dosar-client-n020`, if still present. Verify current schema and backup; do not assume its older API is compatible with the active branch.
- **N-028, Alpha Clima copy on then-current main**: [Notion registry](https://app.notion.com/p/4088ea98e40f81268195cbe280899e5c); recorded copy `%LOCALAPPDATA%\WorkOS\demo-alpha-current-main`, with backup and schema 049 as of 2026-10-29. Verify actual files, lease, version, content and health before use. Historical frontend/API ports are **not** guaranteed live.
- **New isolated fixture**: allowed for targeted tests, empty/error/security states or a specific missing scenario; it is **not a substitute** for a realistic positive E2E check when a protected compatible persistent scenario already exists. State the necessity and scope. New persistent environments or wholesale seed reconstruction require explicit Owner decision.

**Protect all existing demo originals and real environments.** Never reset, reseed, overwrite, migrate in place, delete, repoint, stop or take over a protected runtime to make a test pass. For any mutating proof, use a separately verified compatible copy after explicit scoped authorization, with independent root identity and backup/restore evidence. Never put credentials, database files or secrets in Git, PR attachments or screenshots.

A passing component test or minimal synthetic fixture proves its own assertions only. **UI/UX acceptance requires at least one nontrivial positive end-to-end journey** with recorded objects/operations/evidence, in addition to empty/error and permission states. If the existing rich scenario cannot safely run on the candidate code, record `DATA_COMPATIBILITY_HOLD`, keep the useful implementation in review, and state the smallest safe next action. Do not silently recreate the dataset or claim full visual acceptance.

The coordinating independent reviewer (ChatGPT) owns this gate and checks that Cursor's claimed reuse, environment identity and browser evidence are traceable. A Cursor PASS alone is not Owner acceptance. Notion decision: https://app.notion.com/p/40a8ea98e40f812cac6cf929dad44f5a.

## Required workflow for substantial UI/UX work

1. Discover the operator's real task, route and available canonical data/permissions.
2. Inspect the applicable WorkOS-N page, related accepted variants, components and styles.
3. Create or refine **within that existing page** the necessary concept, state and responsive variants, without deleting history.
4. Compare structural alternatives when justified; obtain the Owner's explicit direction/acceptance for the scoped variant.
5. Implement in `office952/workos-po` with one writer, business rules owned by the engine.
6. Check the actual browser against the accepted Figma variant: hierarchy, navigation, states, keyboard/focus, responsive (1440/1280/768/390 where relevant) and light/dark.
7. Report remaining Figma ↔ code ↔ runtime differences and obtain separate technical/merge acceptance.

A design change does not authorize product behavior changes, real database operations, deployment or merge. For trivial nonvisual fixes, Figma design creation is unnecessary.

## Historical policies retained as provenance

- `docs/FIGMA_AUTHORITY.md` and WorkOs-F: retired **as current design authority**; their preserved historical decisions and nodes remain intact.
- `docs/architecture/WORKOS_VISUAL_LANGUAGE_CANON_V1.md`: superseded.
- `CALM INSTRUMENT`, `INDUSTRIAL HARDWARE / FUTURE INTELLIGENCE`, fixed 70/30 ratio, mandatory grey/blue palette and Azure CTA rules: **not** reinstated.
- Decision of 2026-10-16: retained as historical context and superseded specifically by this 2026-10-31 Owner designation.

## Structural constraints unchanged

- One SaaS codebase, business engine and Product Truth; no client-specific fork.
- Modular stylesheets as defined by `docs/architecture/WORKOS_UI_STYLE_ARCHITECTURE_V1.md`; no new major surface should bulk up `src/styles/ui.css`.
- No replacement component library or styling framework without explicit Owner GO.
- Romanian operator-facing language and no raw internal DTO/status codes in ordinary UI.
- Accessibility, responsive layout, visible focus, keyboard use and honest loading/empty/error states.
- Server-owned permissions/status/eligibility and traceable business operations.

WorkOS-N is an active design workbench, not a license to manufacture business facts or to bypass browser verification.
