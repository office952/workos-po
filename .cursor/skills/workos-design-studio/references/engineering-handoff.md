# Engineering handoff

Compact transition from Design Studio into implementation.

Do not return the entire design-thinking context to the engineering writer.
Do not authorize implementation unless an Owner GO already did.

## Reality

```text
JOB
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

## Design

```text
ACCEPTED_COMPOSITION
PRIMARY_HIERARCHY
INTERACTION_INTENT
RESPONSIVE_INTENT
STATE_INTENT
FIGMA_OR_VISUAL_REFERENCE
KNOWN_CONSTRAINTS
DO_NOT_INVENT
```

## How to fill

- `JOB` — the page's real job in one sentence.
- Reality fields — extracted before design. Empty means stop, not invent.
- `ACCEPTED_COMPOSITION` — the spatial idea Owner can accept, not a component inventory.
- `PRIMARY_HIERARCHY` — what must be seen first, second, last.
- `INTERACTION_INTENT` — what the user does, not the React tree.
- `RESPONSIVE_INTENT` — how the dominant idea survives 1440 / 1280 / 768.
- `STATE_INTENT` — loading, empty, blocked, ready, error — only states that already exist or are marked `NOT_IMPLEMENTED`.
- `FIGMA_OR_VISUAL_REFERENCE` — accepted node, partial reference, silent, or explicit off-Figma exploration. Never treat a runtime screenshot as authority.
- `KNOWN_CONSTRAINTS` — Product Truth, permissions, frozen snapshots, Configurator hold, token/shell hold.
- `DO_NOT_INVENT` — fields, statuses, routes, formulas, libraries, and visual systems that remain closed.

## Engineering still owns truth

```text
WORKOS PO API → typed transport → adapter → presentation → UI
```

UI may code experience. UI must not duplicate ProductDefinition, formulas, pricing, readiness, eligibility, execution state, or database truth.

`FIGMA_WRITE = NO` unless a later Owner GO says otherwise.
