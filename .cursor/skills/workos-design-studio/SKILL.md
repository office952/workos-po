---
name: workos-design-studio
description: Persistent WorkOS design-thinking mode for UI/UX exploration, composition, hierarchy, visual critique and refinement while preserving real Product Truth. Use when exploring presentation, critiquing a rendered WorkOS surface, refining visual hierarchy, or handing an accepted composition to engineering. Does not own Product Truth, Configurator, Figma, tokens, or production UI.
disable-model-invocation: true
icon: book-open
color: cyan
---

# WorkOS Design Studio

Tooling overlay. Not a second Product Truth, Figma authority, product canon, or component library.

```text
DESIGN_INTELLIGENCE = TOOLING_OVERLAY
ROADMAP_REPLACEMENT = NO
CURRENT_PRODUCT_PROGRAM_REMAINS_AUTHORITATIVE = YES
NO_NEW_PERSISTENT_RULE = YES
FIGMA_MODE = READ_ONLY
OFF_FIGMA_EXPLORATION = ALLOWED_NON_AUTHORITATIVE
OFF_FIGMA_BUILD_AUTHORITY = NO
CONFIGURATOR_REDESIGN = NO
TOKEN_CORRECTION = NO
SHELL_CORRECTION = NO
```

## Posture

DESIGN decides how truth is experienced.
ENGINEERING guarantees that truth remains true.

```text
UNDERSTAND BEFORE YOU DESIGN.
EXPLORE WITHOUT FEAR.
CRITIQUE WITHOUT MERCY.
BUILD WITH DISCIPLINE.
BE BOLD IN PRESENTATION.
BE CONSERVATIVE IN SEMANTICS.
```

Existing runtime UI is evidence. It is not automatically the best visual answer.

Preserve: contracts, semantics, behavior, Product Truth.

May challenge: visual hierarchy, composition, density, spacing, card architecture, page rhythm, use of available width, information grouping, discoverability, progressive disclosure, responsive transformation, page personality.

## Reality extraction first

Before substantive product UI design, extract:

```text
REAL_OBJECTS
REAL_FIELDS
REAL_ACTIONS
REAL_STATES
REAL_RELATIONSHIPS
REAL_PERMISSIONS
REAL_CONSTRAINTS
UNKNOWN
NOT_IMPLEMENTED
```

Only then explore presentation.

Do not let unrelated CI, packaging, security tooling, release procedure, Git history, or backend implementation detail dominate the creative phase unless the task actually depends on them.

## Load on demand

Read only the reference the current step needs:

- Who uses WorkOS and the environment of use → [references/design-context.md](references/design-context.md)
- Design judgment (not CSS values) → [references/taste-dna.md](references/taste-dna.md)
- One language, different page jobs → [references/page-personality.md](references/page-personality.md)
- Visual anti-slop and distinctiveness → [references/anti-slop.md](references/anti-slop.md)
- Screenshot-first critique and Owner vocabulary → [references/critique-method.md](references/critique-method.md)
- Compact handoff into implementation → [references/engineering-handoff.md](references/engineering-handoff.md)

Do not copy `AGENTS.md` into context. Do not invent a second authority document.

Living product program: `docs/ROADMAP.md`.
Sole Figma authority document: `docs/FIGMA_AUTHORITY.md`.
Configuration-First architecture: `docs/architecture/WORKOS_CONFIGURATION_FIRST_CANON.md`.

## Figma

Interpret `docs/FIGMA_AUTHORITY.md`. Do not recreate it.

```text
FIGMA_EXPLICIT_AUTHORITY → follow accepted composition closely
FIGMA_PARTIAL_REFERENCE → preserve WorkOS language and solve uncovered composition deliberately
FIGMA_SILENT → non-authoritative exploration is allowed
FIGMA_PRODUCT_TRUTH_CONFLICT → Product Truth wins on WHAT is true; accepted Figma may govern HOW truth is experienced
FIGMA_WRITE = NO
```

Do not recreate node `1:19519`. Protected nodes remain protected.
Off-Figma exploration is allowed and non-authoritative. Off-Figma work has no build authority.

## Configurator

Do not redesign Configurator in this wave. Record stable context only.

Future Configurator design may consider blueprint, focused editor, layers, sublayers, horizontal composition, vertical composition, inheritance, overrides, progressive disclosure. Those concepts do **not** authorize UI ownership of ProductDefinition, the visibility engine, inheritance resolver, pricing/commercial resolver, product graph, or server business logic.

Future Configurator design requires a separate Owner GO.

## Exploration tool routing

Route tools by the job. Do not open Canvas for every UI task. Do not treat a missing Agent API as proof that a Cursor UI feature is absent.

```text
MICRO_VISUAL_CHANGE
Browser evidence
→ Owner Browser Design Mode
→ Design Studio judgment / refinement
CANVAS_BY_DEFAULT = NO

EXISTING_PAGE_REFINEMENT
Design Studio
→ Browser observation
→ Browser Design Mode when useful
→ implementation / refinement
Canvas only when a genuinely unsettled structural or spatial idea appears.

UNSETTLED_STRUCTURAL_UI
floorplan / information architecture / selection model /
spatial hierarchy / workbench relationship / major interaction model
Reality Extraction
→ Browser observation of current runtime (evidence, not authority)
→ Canvas exploration STRONGLY_PREFERRED when accepted Figma does not already settle the composition
→ Owner composition decision
→ compact engineering handoff
→ implementation
→ Browser + Design Mode refinement

NEW_COMPLEX_SURFACE
accepted Figma settles the relevant structure → do not duplicate exploration in Canvas
otherwise → Canvas exploration = STRONGLY_PREFERRED

CONFIGURATOR
future Owner-authorized structural redesign
(PRODUCT / LAYER / SUBLAYER / BLUEPRINT / HORIZONTAL / VERTICAL /
SELECTION / PROPERTIES / VALIDATION / REVIEW)
Canvas before implementation = STRONGLY_PREFERRED
unless accepted Figma already settles the required composition
This does not authorize Configurator redesign now.
CONFIGURATOR_REDESIGN = NO
```

```text
CANVAS = NON_AUTHORITATIVE_EXPLORATION
CANVAS != Product Truth
CANVAS != Figma authority
CANVAS != WorkOS implementation
CANVAS != WorkOS component / token authority
CANVAS != CAD precision
CANVAS != build authority
```

Canvas must not invent fields, states, formulas, permissions, readiness, business rules, or technical precision unsupported by Product Truth. Keep `UNKNOWN` and `NOT_IMPLEMENTED` explicit.

Canvas Design Mode is an official Cursor capability: the Owner may select and annotate elements inside an exploratory Canvas when that UI is available. It improves iteration on the exploratory artifact only.

```text
CANVAS_DESIGN_MODE_OFFICIAL = YES
LOCAL_OWNER_UI_VERIFICATION = NOT_REQUIRED_FOR_STABLE_ROUTING
CANVAS_DESIGN_MODE != Product Truth
CANVAS_DESIGN_MODE != accepted Figma
CANVAS_DESIGN_MODE != implementation authority
CANVAS_DESIGN_MODE != product code
```

After Owner composition decision and engineering handoff, the Canvas is exploration evidence / a design-decision artifact. It must not become a second living design system or a second WorkOS implementation. Product truth stays in canonical WorkOS sources.

## Loop

```text
design → critique → refine → critique → stop or Owner review
```

Do not create infinite polish loops.

When implementation is authorized, hand off with [references/engineering-handoff.md](references/engineering-handoff.md). Return only the compact fields. Do not dump the entire design-thinking context onto the engineering writer.

The existing UI/UX reviewer remains independent and READ-ONLY. This skill is not a second reviewer.
