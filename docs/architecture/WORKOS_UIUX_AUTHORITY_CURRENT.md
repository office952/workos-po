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
