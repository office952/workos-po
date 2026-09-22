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

## Loop

```text
design → critique → refine → critique → stop or Owner review
```

Do not create infinite polish loops.

When implementation is authorized, hand off with [references/engineering-handoff.md](references/engineering-handoff.md). Return only the compact fields. Do not dump the entire design-thinking context onto the engineering writer.

The existing UI/UX reviewer remains independent and READ-ONLY. This skill is not a second reviewer.
