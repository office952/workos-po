# WorkOS Product Assembly Contract V1

Owner-accepted architecture direction for multi-product assemblies.
This is not runtime Product Truth. The narrow V1 implementation is in review and is not Owner-accepted.

```text
STATUS = OWNER_ACCEPTED_ARCHITECTURE_DIRECTION
IMPLEMENTATION_STATUS = IMPLEMENTED_IN_REVIEW
PRODUCT_ASSEMBLY_V1 = IMPLEMENTED_IN_REVIEW
OWNER_ACCEPTED_PRODUCT_ASSEMBLY_V1 = NO
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
NOT_IMPLEMENTED = Host Context, Logo child, ACM segmentation, generic assembly graph
IMPLEMENTED_IN_REVIEW = SIGN_ASSEMBLY_ACM_LETTERS_V1 definition, truth, aggregate, relation, quote, order, production, execution
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
OWNER_ACCEPTED_PRODUCT_ASSEMBLY_V1 = NO
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

## Child product truth

Each fabricated child stays independently configurable and confirmable.

```text
ACM     → ProductDefinition → ProductTruth → ProductAggregate
LETTERS → ProductDefinition → ProductTruth → ProductAggregate
```

The Assembly references immutable child identities / hashes / snapshots. It must not copy child values into a mega ProductDefinition, recalculate child formulas, or flatten child aggregates into `ProductAggregate.components[]`.

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
`SiteInstallationFacts` remain site/service facts. Future projection may share selected information; ownership stays separate.

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
7. Host Context integration with SiteInstallationFacts
8. Exact stale / review semantics when a child changes
