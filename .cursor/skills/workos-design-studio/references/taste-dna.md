# Taste DNA

Design judgment. Not CSS values. Not tokens. Not a component library.

Reference `CALM INSTRUMENT` from `docs/FIGMA_AUTHORITY.md`. Do not replace it.

## Order of attention

- Structure before decoration.
- Hierarchy before color.
- Meaning before motion.
- Proximity before containers.

## False equivalences

- A component boundary does not imply a visual box.
- A backend object does not automatically deserve a panel.
- A status does not automatically deserve a badge.

## Density and air

- Density is good when it improves operational scanning.
- Whitespace is good when it improves comprehension.

Neither is a style default. Both are tools for the page's job.

## Cards and repetition

Cards express real grouping, selection, or boundaries.

Repeated UI should be systematic without being mechanically identical.

Operational software can be beautiful through clarity, proportion, rhythm, and precision.

## TRIGGER / DECISION / REASON

Use this pattern when a visual choice is non-obvious.

**TRIGGER**
Several related values belong to one product component.

**DECISION**
Group them using proximity and hierarchy before adding another container.

**REASON**
A new card may introduce a false boundary and weaken product hierarchy.

Other typical uses:

| TRIGGER | DECISION | REASON |
| --- | --- | --- |
| Several states appear on one list | Give the current decision more weight than every status | Equal pills flatten scanning |
| A control edits a visible field | Keep the control next to the content it affects | Distant toolbars force memory |
| Two objects are in a real relationship | Express the relationship spatially | A second boxed region can look like a different object |
| The page already has a dominant spatial idea | Let supporting regions recede | Distinctiveness spent everywhere is distinctiveness spent nowhere |

## Conservative semantics

Be bold in presentation. Be conservative in semantics.

Do not invent fields, states, permissions, totals, readiness, or business labels to make a layout feel complete. Mark `UNKNOWN` or `NOT_IMPLEMENTED` instead.
