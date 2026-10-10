# WorkOS Product Assembly Contract V1

Owner-accepted architecture direction for multi-product assemblies.
This is not runtime Product Truth. Narrow V1 is Owner-accepted and integrated.

```text
STATUS = OWNER_ACCEPTED_ARCHITECTURE_DIRECTION
PRODUCT_ASSEMBLY_CONTRACT_V1 = OWNER_ACCEPTED_DIRECTION
IMPLEMENTATION_STATUS = COMPLETE / OWNER_ACCEPTED
PRODUCT_ASSEMBLY_V1 = COMPLETE / OWNER_ACCEPTED
PRODUCT_ASSEMBLY_IMPLEMENTATION = COMPLETE / INTEGRATED
OWNER_ACCEPTED_PRODUCT_ASSEMBLY_V1 = YES
PRODUCT_ASSEMBLY_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
PRODUCT_ASSEMBLY_MODEL = TYPED_ASSEMBLY
ONE_PRODUCT_TRUTH = PRESERVED
NO_ABSORPTION = CANONICAL
CHILD_PRODUCT_TRUTH = INDEPENDENT
ASSEMBLY_INTERFACE = EXPLICIT_RELATION
HOST_CONTEXT = DISTINCT_TECHNICAL_CONTEXT
HOST_CONTEXT_IS_SITE_INSTALLATION_FACTS = NO
PRODUCT_SYSTEM_ROLE = ALLOWED_COMBINATION_RULES
PRODUCT_SYSTEM_JOB_INSTANCE = NO
NEW_CAPABILITY = NO
OWNERSHIP = PRODUCT + TRUTH_COMPILER
TECHNICAL_COMPOSITION_COMMERCIAL_LINES_COUPLED = NO
PROCESS_COMPOSITION_IS_PRODUCT_ASSEMBLY = NO
CURRENT_QUOTE_SNAPSHOT_ASSEMBLY_SUPPORT = ADDITIVE_ASSEMBLY_QUOTE
STANDALONE_QUOTE_SNAPSHOT = UNCHANGED_ONE_PRODUCT
NO_CLIENT_CODE_FORK = YES
```

Living program sequence remains `docs/ROADMAP.md`. Current Letters and ACM ProductTemplates remain independent SKUs.

## Classification

```text
CANONICAL_DIRECTION = Owner-accepted model below
CURRENT_IMPLEMENTATION = one ProductTemplate → one ProductDefinition / ProductTruth / ProductAggregate → one QuoteSnapshot.productCode
NOT_IMPLEMENTED = ACM segmentation, generic assembly graph, recursive assemblies, CAD positioning, mounting price, mounting hardware
IMPLEMENTED = SIGN_ASSEMBLY_ACM_LETTERS_V1 definition, truth, aggregate, relation, grouped quote, order, production, execution
VOLUMETRIC_LOGO_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_VOLUMETRIC_LOGO_V1 = YES
PRODUCT_ASSEMBLY_V2 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_PRODUCT_ASSEMBLY_V2 = YES
VOLUMETRIC_LOGO_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
PRODUCT_ASSEMBLY_V2_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
ASSEMBLY_V2_KIND = SIGN_ASSEMBLY_ACM_SIGNAGE_V2
HOST_CONTEXT_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_HOST_CONTEXT_V1 = YES
MOUNTING_INTERFACE_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_MOUNTING_INTERFACE_V1 = YES
SITE_INSTALLATION_VERTICAL_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_SITE_INSTALLATION_VERTICAL_V1 = YES
HOST_CONTEXT_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
MOUNTING_INTERFACE_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
SITE_INSTALLATION_VERTICAL_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
OPEN_DECISION = listed at the end; do not reopen the top-level model
```

## Core model

```text
PRODUCT ASSEMBLY
│
├── MEMBER
│   ├── ProductTruth / ProductAggregate reference
│   └── role in assembly
│
├── HOST CONTEXT
│   └── only when the host is not a fabricated WorkOS product
│
└── RELATIONS
    └── Assembly Interface
```

Future conceptual lifecycle is implemented for the narrow V1 kind `SIGN_ASSEMBLY_ACM_LETTERS_V1`:

```text
AssemblyDefinition → AssemblyTruth → AssemblyAggregate
```

V1 types live in `packages/domain/src/assembly`. This document remains the architecture authority.

Implemented V1 scope:

```text
KIND = SIGN_ASSEMBLY_ACM_LETTERS_V1
MEMBERS = SUPPORT_PANEL PRD-ACM-CASSETTE-NONE + SIGNAGE_LETTERS PRD-LETTERS-FRONTLIT-PLEXI-AL06
RELATION = LETTERS_ON_ACM_PANEL
RELATION_FIELDS = relationId, kind, sourceMemberId, targetMemberId
COMMERCIAL = one grouped assembly, two child sections
ASSEMBLY_RELATION_COMMERCIAL_PRICE = NONE
PROCESS = MOUNT_LETTERS_ON_PANEL then assembly final QC then one packing task
HOST_CONTEXT = NOT_IN_V1
LOGO = NOT_IN_V1
SEGMENTATION = NOT_IN_V1
OWNER_ACCEPTED_PRODUCT_ASSEMBLY_V1 = YES
```

## No-absorption law

```text
PRODUCT A + PRODUCT B
DOES NOT AUTOMATICALLY MAKE
PRODUCT B A COMPONENT OF PRODUCT A

PANOU ACM != BACK OF LETTERS
LETTERS != ACM FACE
```

Current Letters BACK remains `FOREX_BACK` on `PRD-LETTERS-FRONTLIT-PLEXI-AL06`.
Current ACM remains `PRD-ACM-CASSETTE-NONE` with `ACM_CASSETTE_BODY` + `STEEL_INTERNAL_FRAME`.

## Two product physical invariants

Owner-accepted. Architecture constraints only; no new runtime behavior.

```text
LETTERS.BACK = FOREX_BACK (Forex 10 mm), on any support
ACM_SUPPORT = separate product PRD-ACM-CASSETTE-NONE
ACM_CASSETTE_BODY != LETTERS.BACK
STEEL_INTERNAL_FRAME != LETTERS.BACK
ACM_ROLE_NAME_BACK = role slot only, not physical equivalence with LETTERS.BACK
PANEL_DIMENSIONS_DRIVE_LETTERS_BACK = NEVER
ASSEMBLY_RELATION_RECALCULATES_CHILD_PRODUCT = NEVER
FLATTEN_CHILD_PRODUCT_TRUTH = NEVER
LETTERS_ON_ACM_PANEL per SIGN_ASSEMBLY_ACM_LETTERS_V1 = exactly 1
FLAT_GROOVED_BACK = NOT_IMPLEMENTED
```

- Letters BACK remains `FOREX_BACK`; its quantity derives from the confirmed letters face area only.
- ACM support remains a separate product with its own truth, aggregate and provenance. ACM never replaces letters BACK; Forex never becomes ACM and ACM never becomes Forex.
- Flat / grooved is a future BACK manufacturing / construction distinction. It is not a material, not a support product and not a new product identity. No `...-FLAT-BACK` product code. Future work keeps the same letters identity with versioned Product Truth.
- Future derivation is fail-closed: a typed panel support may imply flat and a typed metal frame may imply grooved. Generic HostContext `facadeType = METAL` is insufficient to imply `METAL_FRAME` and must never produce grooved on its own.
- Historical snapshots remain immutable; a child reconfirmation creates new truth and leaves the confirmed assembly unchanged.
- Assembly EIC follows the final assembly production graph. See "Assembly internal EIC reconciliation" below.

Regression proof: `packages/domain/src/assembly/assembly.test.ts` (two product physical invariants), `packages/domain/src/resources/productTemplateUsage.test.ts`, `packages/domain/src/product/back.test.ts`, `apps/api/tests/product-assembly.test.ts`.

## Assembly internal EIC reconciliation

```text
ASSEMBLY_EIC_RECONCILIATION_IMPLEMENTATION = LOCAL_CANDIDATE_PENDING_REVIEW
FINAL_ASSEMBLY_EIC_FOLLOWS_FINAL_PRODUCTION_GRAPH = YES
ASSEMBLY_EIC_RAW_CHILD_SUM = REMOVED
CHILD_TERMINAL_COST_SURVIVES_IF_OPERATION_REMOVED = NO
UNKNOWN_COST = ZERO = NEVER
MISSING_ASSEMBLY_COST_EVIDENCE = PARTIAL
EIC_TOTAL = KNOWN_RECONCILED_SUBTOTAL
CHILD_PRODUCT_TRUTH_MUTATION = NEVER
COMMERCIAL_REPRICING = OUT_OF_SCOPE
NEW_COST_RATES_OR_RECIPES = NONE
SITE_INSTALLATION_EIC = FROZEN_SERVICE_LINE / OUTSIDE_ASSEMBLY_PRODUCTION_EIC
```

Owner: `reconcileAssemblyEic` in `packages/domain/src/assembly/eic.ts`, called by `projectAssemblyProduction`. It reads frozen order evidence only: each child's frozen `eicTotal`, frozen `productionInput` operations, requirements and `usedRecipes` traces, and the final assembly operations. It never reads current cost evidence, rates or the recipe catalog, and it never recompiles a child.

- **Retained child cost.** The child's frozen standalone EIC is the starting point. Material and fabrication cost for work that stays in the member graph is unchanged.
- **Superseded child terminal cost.** Assembly removes child `PACK_PRODUCT`, `INSPECT_FINISHED_LETTER` and `INSPECT_FINISHED_LOGO`. A child recipe cost leaves the child contribution only when every frozen trace of that recipe belongs to a removed operation. It leaves once per recipe, matching standalone recipe-id deduplication. It does not leave when the same resource is a frozen material requirement, because standalone EIC charged that resource through the requirement, not the recipe. A recipe with any surviving traced process stays costed once. Frozen traces of one recipe that disagree are not guessed: the cost stays and the result is PARTIAL.
- **Assembly operations.** `MOUNT_LETTERS_ON_PANEL`, `MOUNT_LOGO_ON_PANEL`, `INSPECT_FINISHED_ASSEMBLY` and the final assembly `PACK_PRODUCT` have no frozen cost evidence or quantity today. They are reported as unpriced and make assembly EIC `PARTIAL`; they are never counted as zero. The final assembly pack does not inherit a child pack cost, and no assembly packing area, mount rate, QC rate or labor duration is inferred.
- **Site installation.** `INSTALL_AT_SITE` cost is the frozen `FrozenSiteInstallationQuoteLineV2.eic` on the order service line. As for standalone production releases (`AcceptedProductionSnapshot.eic` = product EIC while `INSTALL_AT_SITE` is appended), it stays on that frozen line, outside `AssemblyProductionSnapshot.eicTotal`. It is neither recalculated nor dropped, and it is not reported as an unknown cost.
- **Commercial.** Quote / order totals and child commercial offers are unchanged. EIC reconciliation never reprices.
- **History.** Persisted assembly production snapshots are insert-once and are not rewritten. Only new projections carry the reconciled EIC.

Current synthetic V1 and V2 assemblies therefore resolve to `eicCompleteness = PARTIAL`. Their `eicTotal` is the sum of child frozen EIC minus each child's frozen `RCP_PACK_PRODUCT` trace cost. COMPLETE becomes possible only when frozen assembly-operation cost evidence exists. That would be a separate Owner decision.

Regression proof: `packages/domain/src/assembly/assemblyEic.test.ts`.

## Child product truth

Each fabricated child stays independently configurable and confirmable.

```text
ACM     → ProductDefinition → ProductTruth → ProductAggregate
LETTERS → ProductDefinition → ProductTruth → ProductAggregate
```

Assembly technical truth references immutable child ProductTruth and ProductAggregate identities and hashes. It does not copy child values, and it does not own child quote identity. Child quote snapshot identity is frozen later, on the assembly quote. The assembly must not recalculate child formulas or flatten child aggregates into `ProductAggregate.components[]`.

## Product System

PRODUCT / Product System may define allowed assembly kinds, child roles, template combinations, and interface kinds. Example conceptual future: `SIGN_ASSEMBLY` with children `ACM_PANEL`, `LETTERS`, later `LOGO`, and relation `LETTERS_ON_PANEL`.

Product System does not own the job instance, the selected children for one request, or confirmed assembly facts.

## Support, mounting, interface, host

```text
SUPPORT            = what physically hosts the work
MOUNTING           = how something is fixed
ASSEMBLY_INTERFACE = relation object between WorkOS objects,
                     or between a WorkOS product and typed Host Context
```

```text
ASSEMBLY_INTERFACE != product != component != process
HOST_CONTEXT != ProductDefinition != ProductAggregate
HOST_CONTEXT != automatically a commercial line
HOST_CONTEXT_IS_SITE_INSTALLATION_FACTS = NO
```

Possible interface facts (not a V1 persisted field set): source / target, host, alignment, mounting relationship, stand-off, pass-through, cable passage, joint dependency.

```text
POSSIBLE_INTERFACE_FACTS = listed above
V1_FIELD_SET = OPEN_DECISION
```

Existing customer ACM facade is Host Context (`type = ACM`). It does not instantiate `PRD-ACM-CASSETTE-NONE`.
`SiteInstallationFacts` remain the mutable request source. Host Context V1 is Owner-accepted as a derived projection of those facts, frozen into the commercial and execution chain. It is not ProductTruth and it is not AssemblyTruth. Frozen downstream truth does not reread mutable request facts.

If WorkOS fabricates the ACM, ACM is a normal child product with its own definition, truth, aggregate, materials, processes, and provenance. The Letters relation belongs to Assembly Interface.

## Segmented ACM

```text
SEGMENTED_ACM_DEFAULT = ONE_ACM_PRODUCT_WITH_INTERNAL_SEGMENTS
SEGMENT != automatically ProductDefinition
```

Future ACM truth may contain segments, joints, and seams inside the ACM product model. Create multiple ACM ProductDefinitions only when they are genuinely independent configurable subassemblies. Segmentation is `NOT_IMPLEMENTED`.

## Confirmation and aggregate

```text
CONFIRM CHILD PRODUCTS → REVIEW ASSEMBLY → CONFIRM ASSEMBLY
```

Assembly confirmation references confirmed child truths and freezes interface facts. It does not rewrite child truth. A later child change creates a new child truth; the previous assembly remains historical; the active draft/review must become stale / re-reviewed. Exact stale mechanics are implementation design.

```text
AssemblyAggregate
├── child ProductAggregate references
├── interface-derived demand
└── assembly-level derived demand
```

Total technical demand later derives from child demands + assembly/interface demand, without recalculating child Product Truth.

## Process composition

Current `composeProductProcessesFromTruth()` is **product process composition**. It is not product assembly.

```text
ACM ProductTruth     → ACM process composition
Letters ProductTruth → Letters process composition
AssemblyTruth        → assembly/interface process composition
                     → later ExecutionPlan
```

Configurator owns truth and relations. Process composition derives consequences. ExecutionPlan schedules work.

## Commercial and snapshots

```text
TECHNICAL ASSEMBLY != COMMERCIAL QUOTE LINE STRUCTURE
COMMERCIAL_LINE_POLICY = V1_GROUPED_ASSEMBLY_TWO_CHILD_SECTIONS
ASSEMBLY_RELATION_COMMERCIAL_PRICE = NONE
CURRENT_QUOTE_SNAPSHOT_ASSEMBLY_SUPPORT = ADDITIVE_ASSEMBLY_QUOTE
STANDALONE_QUOTE_SNAPSHOT = UNCHANGED_ONE_PRODUCT
```

V1 presents one grouped assembly with two child product sections. The relation has no commercial price. Later assemblies may use another grouping only with a new Owner decision.

Future assembly-aware snapshots preserve assembly identity/version, child truth identities/hashes, child template/version provenance, relation facts, and assembly technical provenance. Historical accepted work stays immutable. The standalone QuoteSnapshot remains one-product. V1 adds a separate assembly quote, order, and production snapshot.

## Terminology

Do not rename current runtime UI in this wave. Avoid generic operator label `COMPOZIȚIE` for multiple concepts.

```text
REZUMAT PRODUS     = read-only projection of one product
ANSAMBLU           = technical object: members + relations
REZUMAT ANSAMBLU   = read-only projection of the complete assembly
COMPOZIȚIE PROCES  = internal operational process composition
```

## Configurator direction

Presentation only. No UI implementation authorized. Not a wizard. Not CAD.

```text
UI_MODEL = ASSEMBLY → PRODUCT → COMPONENT
```

Assembly scopes, only when they exist: PANOU ACM, LITERE, ANSAMBLARE, REZUMAT ANSAMBLU.
Letters internals: Față, Volum, Spate, Iluminare.
ACM internals: Corp casetă, Cadru intern.
Existing host: Host Context, not a fake ACM product.

## Smart modularity

Assemblies are additive. Standalone Letters, ACM, and future simple products remain first-class. Assembly is not a prerequisite for quoting, production, catalog enablement, or basic WorkOS operation.

## Open decisions

1. Minimum persisted AssemblyInterface V1 field set
2. Exact AssemblyDefinition / Truth / Aggregate TypeScript contracts
3. Persistence schema
4. Assembly-aware Quote / Order / Production snapshot schema
5. Commercial line / grouping policy
6. Detailed ACM segmentation contract
7. Host Context integration with SiteInstallationFacts — closed; Owner-accepted with Host Context V1
8. Exact stale / review semantics when a child changes
9. Assembly EIC reconciliation with the final assembly production graph — local candidate pending review (see "Assembly internal EIC reconciliation"); frozen assembly-operation cost evidence remains open
