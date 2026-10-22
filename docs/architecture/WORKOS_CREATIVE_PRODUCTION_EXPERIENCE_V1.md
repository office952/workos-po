# WorkOS — Creative Production Operating System · Experience & Visual Direction V1

\`\`\`text
STATUS = DESIGN_PROPOSAL / BENCHMARK_CREATED
OWNER_GO = DOCUMENTATION_AND_EXECUTION_BENCHMARK (2026-10-16)
OWNER_VISUAL_ACCEPTANCE = PENDING
IMPLEMENTATION_AUTHORIZATION = NOT_BY_THIS_DOCUMENT
CURRENT_UIUX_POLICY = docs/architecture/WORKOS_UIUX_AUTHORITY_CURRENT.md
REPOSITORY = office952/workos-po
\`\`\`

This is a design-direction and experience specification for WorkOS, **not** a second business canon and not a mandatory visual theme. It records the Owner-authorized research reconciliation and the first Execution screen benchmark. It does not authorize merge, deploy, migrations, or real-data operations.

Sources:
- [Owner's 2026-10-16 UI/UX policy](WORKOS_UIUX_AUTHORITY_CURRENT.md) — controls; historical Figma, CALM INSTRUMENT, Industrial Hardware / Future Intelligence, the 70/30 ratio, and imposed palettes are **not** binding.
- [Experience Architecture V2 (Notion)](https://app.notion.com/p/3e48ea98e40f81ce9e8ad59509977d6b) — especially the current 2026-10-16 override.
- [Visual & Interaction Language Research V1 (2026-09-24)](https://app.notion.com/p/3e58ea98e40f8189acb4e9e44a8bc522) — design research; not current aesthetic authority.
- [Creative Production OS design direction — Notion](https://app.notion.com/p/3fb8ea98e40f81b290dbe8aadd476d1f) — proposal and reasoning.
- [N-009 implementation record](https://app.notion.com/p/3fa8ea98e40f81d5b039e664e1ca1ef5) — specific Jobs → Atelier → Execution scope.

## 1. Product experience promise

**WorkOS — Creative Production Operating System** is the descriptive product experience frame documented in research, **not a product renaming or approved public slogan**.

A request can become a product instance, artwork, a frozen quote, an accepted job, a production plan and an executed result. Throughout this journey, the user should not reconstruct an object's identity, status, source or next step by switching between unrelated screens.

**At any point, WorkOS should answer:**
1. What object and organization am I operating on?
2. What is verified and current? What is still unknown?
3. What needs attention now, and why?
4. What action is permitted, by whom, and with what consequence?
5. What did the system save, and where do I continue?

Identity comes from the real work of creative manufacture, **not** from making every screen look like a steel machine.

## 2. Research DNA, applied selectively

| Research concept | UX obligation | Do not do |
| --- | --- | --- |
| **Object Continuity** | Stable object anchor: name, customer, traceable source and selection across commercial and production pages | Lose context in deep-link navigation; substitute unrelated names for one job |
| **Truth + Lineage** | Surface provenance, version and frozen-vs-live state when consequential; separate planned/estimated/actual | Render plausible filler amounts or fabricated readiness |
| **Exception First** | Put blockers and recoverable actions next to the task; differentiate warnings from eligibility | Make all warnings red hard blockers or promote vanity KPI cards |
| **Vector Workshop** | Synced structure/selection/blueprint/inspector in configuration and real artwork workflows | Decorative vector nodes on Clients, fake CAD, invented geometry |
| **Creative Production OS** | Preserve the arc from creative intent and approved assets to physical execution | Generic CRM skin or hardware props repeated without functional reason |

The historical **Industrial Hardware / Future Intelligence** research remains one *possible visual influence*; the 2026-10-16 policy explicitly withdrew it as an immutable visual identity. Dark graphite, bronze/amber and tactile elements may be explored and accepted screen by screen; they are not mandatory across WorkOS. Light mode must be equally usable.

## 3. Four truths; one continuity

- **Business Truth** — client, request, commercial acceptance, order/job references.
- **Product Truth** — canonical product definition, components, technical configuration and confirmed geometry/quantities where owned.
- **Asset Truth** — artwork and file versions, approval and production source **only when backed by real data/contracts**.
- **Execution Truth** — frozen plan, dependencies, operator, machine/workcenter, status, actuals, and audit evidence.

These are related but not merged into one frontend state engine. \`apps/api\` and \`packages/domain\` own business decisions. The root frontend presents only transported/projected truth.

\`Work Object Anchor\` is the small, stable identity context. \`Continuity Strip\` can show links between actual related objects, not a fake lifecycle progress bar.

**Lifecycle rail != execution dependency graph**. Lifecycle answers "which business phase?"; dependency graph answers "which technical tasks must finish?".

## 4. Design families and their jobs

| Surface family | Routes/examples | Primary job | Creative expression |
| --- | --- | --- | --- |
| **LEDGER** | Clienți, Cereri, Oferte, registru Lucrări | Scan / compare / filter / act | Dense, precise, fast; selective contextual preview |
| **TRAVELER** | Fișa lucrării | Understand state, plan, lineage, next step | A meaningful production travel document rather than an ornamental receipt |
| **WORKBENCH** | Catalog/Configurator when constructing a product | Select → see same object → edit same object → validate | Construction Outline ↔ semantic blueprint ↔ properties; no fake CAD |
| **OPERATOR** | Atelier, Execuție | Identify → choose eligible work → act → record result | Reduced chrome, clear state and consequence, physically usable controls |
| **ADMIN** | Organization/technical/policy settings | Change future configuration safely | Deliberate, version-aware, explicit historical impact |

One shell, one interaction grammar, page-specific floorplans. Cereri/Oferte/Clienți are references of mood and quality, **not templates to copy or protected Figma frames**.

## 5. Focused benchmark: EXECUȚIE / Production Cockpit V1

**Design file:** [Execution Cockpit Bench V1](../design/WORKOS_EXECUTION_COCKPIT_BENCH_V1.html).

Status: **illustrative synthetic HTML benchmark**, not the production component, not part of runtime routing, no API calls, no persistence. It intentionally exposes scenario controls only for Owner design review. All example facts are explicitly synthetic.

### 5.1 Job and interaction architecture

An operator arriving from Atelier needs one source-owned current task and one primary next permitted action, not a production dashboard.

At 1440+ px, the benchmark uses:
1. **Object anchor + operator identity** (product/job, client, stage, progress; account != operational operator).
2. **Plan navigator** at left: ordered tasks for context, current selection; no UI inference of priority.
3. **Operation workbench** in the center, visually dominant: title, canonical reason, next action, relevant interactive control, pending/result.
4. **Truth/technical evidence** at right: source-owned provider, dependency, materials, purchased-vs-estimated distinction and resulting trace.

This is not a universal three-column mandate. There may be no useful right-side facts; hide/collapse that region rather than manufacture content.

At 1280 px, prioritize task + list; secondary facts can drop below. At 768 px, put the **selected operation and its action first**, plan below, context last; do not squeeze three desktop rails into a tablet.

### 5.2 Signature move — state-forward command stage

The commanding region is **URMĂTORUL PAS**, derived from existing engine flags/status and \`presentExecutionNextAction\`. It changes with the selected task and identity. It must never become a second eligibility engine.

- **Needs provider:** show the precise "Alocare utilaj / zonă necesară" cause; render provider options and action only when server-owned capability/permission allows.
- **Waiting dependencies:** show the named upstream operation; no misleading Start or editable completed quantity.
- **Ready:** present the start action only when operator/session and server eligibility permit.
- **In progress:** show operational status and allowed capture/closure, not a premature completion prompt.
- **Complete:** switch to a factual receipt of resulting state and a valid continuation; no stale editable controls.
- **Unidentified operator / no plan / server error:** preserve honest blocking and recovery; do not render a fake eligible state.

Additional forms for external execution, rework/quality, active machine run, actual consumption and completed quantity must be driven by their **existing independent domain flags**; never discard these in the redesign.

### 5.3 Visual character

- Calm, precise workshop instrument with an expressive but restrained *physical/digital* character.
- Dark sample: warm graphite, functional brass marks, distinct mint for permitted interaction; **creative sample, not new product palette authority**.
- Light sample: the same information structure, recalibrated contrast; not a mechanical inversion of black CSS.
- Full-size readable type for operation, action and block reason; mono only for IDs, measures, timestamps and instrument labels.
- Meaningful borders, material separations and hierarchy instead of nested generic cards.
- One expressive move per screen; not metal textures, screws, giant imagery or decorative grids on every route.
- Real machine/media preview only when an actual source exists. Do not imply exact CNC/CAD geometry from a schematic.
- Buttons show a verb and consequence. A disabled button must not misrepresent a navigation action as Start.

### 5.4 Feedback grammar

\`\`\`text
OBJECT ANCHOR → CANONICAL STATE → REASON → VALID ACTION
TRIGGER → ACK → PENDING (duplicate prevented)
→ CONFIRMED RESULT → NEXT VALID STEP / RECOVERY
\`\`\`

Keep task selection reflected in URL and screen. Maintain scroll/focus origin when reasonable; keyboard, :focus-visible, accessible labels and reduced-motion behavior are mandatory for production, not demonstrated solely by a screenshot.

## 6. Material request N-009 is NOT a hard gate in default mode

- A shop-floor operator can signal missing material with **no mandatory purchase quantity**.
- Frozen plan estimate remains distinct from subsequent purchasing decision; buying quantity may remain \`null\`.
- A signal is **not** a purchase order or inventory movement.
- In DISABLED/NOT_ADOPTED mode, the shortage is advisory and cannot become a UI-imposed start block.
- Explicit REQUIRED rules, machine/operator eligibility, dependencies and existing server-owned hard gates still apply.
- Author, timestamp, historical request and \`requiresReview\` retain traceability.

## 7. Implementation strategy after Owner visual review

Phase A — **this proposal + benchmark only**: docs and inert standalone synthetic prototype, no root app code, no product behavior or business contracts modified.

Phase B — **Execution implementation** after Owner accepts a specific composition:
- One implementation writer in an isolated verified worktree/branch, derived from a current safe base.
- Inspect \`src/surfaces/ExecutionPage.tsx\`, \`src/presentation/executionNextAction.ts\`, existing transport flags and owner CSS (\`src/styles/surfaces/execution-flow.css\`); classify elements REUSE / MODIFY / CREATE / RETIRE.
- Implement the chosen floorplan with real backend data, not prototype demo values.
- Preserve A+ behavior and external/QC/machine/consumption/actual pathways.
- Test 1440, 1280, 768, 390; dark/light; keyboard/focus; pending/error; no operator, machine unavailable, waiting dependencies, ready, in-progress, completed, external, quality.
- Targeted tests → typecheck/lint/build/verify → isolated synthetic runtime proof → normal commit/push → Draft PR → independent review → explicit Owner merge GO.

Phase C — generalize only the **interaction grammar and object continuity** to Atelier and Lucrări, retaining their own spatial job. No global stylesheet rewrite.

## 8. Acceptance and provenance

| Evidence | Status |
| --- | --- |
| Owner GO for documenting and exploring an Execution etalon | **YES** (2026-10-16) |
| Owner accepted the final Execuție composition | **PENDING** |
| Benchmark is a real WorkOS execution UI | **NO** |
| Synthetic browser benchmark rendered and tested at relevant widths | **YES — standalone only** |
| Real runtime/contract parity for this benchmark | **NOT IMPLEMENTED** |
| Keyboard accessibility in actual N-009 Visual pass | **PENDING PROOF** |
| N-009 feature PR #85 | **DRAFT / NOT MERGED** |
| Real DB, Cloud, deploy, migration writes | **NO AUTHORIZATION** |

The working 2026-10-16 candidate is PR #85 at \`4746a12390a0fb9c0cc505a4c9fddb8d189e093c\` (may advance). The UI policy file and this document are not necessarily integrated in \`main\`; always verify Git state at execution time.

Open risks before N-009 merge are separate from visual direction: historical migration 043 ledger behavior and historical values exceeding the validated quantity bound; PR description still contains obsolete mandatory purchase-quantity language. These are not fixed or waived by a UI benchmark.

**No Owner acceptance or merge is implied by this document.**

## 9. Owner-approved Task Dossier and Smart Provider Binding direction (2026-10-16)

Following the Owner's explicit GO, **Fișa operației** becomes the intended functional signature of Execution: task-scoped instructions, versioned evidence/sketches/files, operator observations and separate issue signals alongside the canonical next step.

- **[Task Dossier + Unique Provider Auto-Binding V1](WORKOS_TASK_DOSSIER_PROVIDER_BINDING_V1.md)** — scoped domain/API/UI implementation brief, safety gates and acceptance cases.
- **[Notion decision](https://app.notion.com/p/3fb8ea98e40f8163ac84dcc2bcca1366)** — approved product intention, pending technical contract and runtime proof.
- A single eligible CNC/workcenter should not force a manual assignment click; bind server-side with audit and no fabricated capacity availability. Multiple eligible providers retain authorized choice.
- This feature needs new persisted task information and a server-owned provider transition; it is not implemented by the HTML benchmark or by PR #85. Build in an isolated feature PR and keep merge/deploy/real DB writes HOLD.

