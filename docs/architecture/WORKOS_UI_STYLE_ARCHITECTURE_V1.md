# WorkOS UI style architecture V1

Status: OWNER-DIRECTED IMPLEMENTATION CANON
Applies to: new UI work and incremental styling changes in `office952/workos-po`.

## Goal

WorkOS must not depend on one ever-growing stylesheet as the owner of the whole application.

Current reality:

```text
src/styles/tokens.css = shared design tokens
src/styles/base.css   = global/base rules
src/styles/ui.css     = large historical/shared stylesheet
```

`ui.css` remains valid legacy runtime code. It is not deleted or mass-refactored merely for cleanliness.

From this canon forward:

```text
NO_NEW_MAJOR_SURFACE_SHOULD_ADD_BULK_TO_UI_CSS = YES
INCREMENTAL_MIGRATION = YES
BIG_BANG_CSS_REWRITE = NO
```

## Architecture

Use plain modular stylesheets with explicit ownership and namespaced classes.

Target shape:

```text
src/styles/
  tokens.css
  base.css

  primitives/
    buttons.css
    fields.css
    status.css
    tables.css
    panels.css

  layout/
    app-shell.css

  themes/
    light.css
    dark.css

  surfaces/
    requests.css
    clients.css
    catalog.css
    offers.css
    jobs.css
    workshop.css
    planning.css
```

The exact file list grows only from demonstrated reuse. Do not create empty architecture for hypothetical needs.

Component-adjacent CSS is also valid for a genuinely isolated complex component, provided it does not create a second token/theme system.

## Ownership rules

### tokens.css

Owns reusable values:
- color roles;
- spacing scale;
- typography roles;
- borders;
- radii;
- elevations/shadows where allowed;
- motion durations/easing;
- z-index roles;
- shared control sizing.

Tokens describe design roles, not page-specific business semantics.

### base.css

Owns:
- reset/normalization;
- body/root defaults;
- global typography defaults;
- accessibility defaults that genuinely apply everywhere.

No feature styling belongs here.

### primitives/

Owns visual patterns that are already reused across multiple surfaces.

Examples:
- button;
- field;
- table skeleton;
- status indicator;
- panel frame.

Do not promote a one-page pattern to a primitive prematurely.

A useful rule:

```text
EXTRACT_AFTER_REAL_REUSE, NOT BEFORE
```

### layout/

Owns application-level shell geometry and shared layout contracts.

It must not know request-specific, offer-specific, or job-specific visual details.

### themes/

Owns theme-level overrides/variables.

Dark/light should primarily change token values and calibrated state styling, not duplicate entire page styles.

### surfaces/

Each major product surface owns its page-specific presentation.

Examples:
- `requests.css` owns Cereri;
- `offers.css` owns Oferte;
- `workshop.css` owns Atelier.

Use a clear class namespace per surface, for example:

```text
.requests-page
.requests-toolbar
.requests-table
.requests-row
.requests-detail
.requests-status
```

Avoid selectors that reach into another surface.

## ui.css policy

`src/styles/ui.css` is a historical compatibility stylesheet.

Allowed:
- fixing a bug in an existing selector already owned there;
- preserving an accepted surface that is not being migrated;
- tiny shared compatibility corrections where moving ownership would increase risk.

Not allowed by default:
- placing the full styling of a new major surface there;
- adding hundreds of lines for Cereri, Oferte, Lucrari, Atelier, etc.;
- using it as the automatic destination for every new selector;
- adding a second theme/token system inside it.

When a historical surface is materially redesigned, evaluate moving its touched styles to the appropriate modular owner as part of that surface's work. Do not migrate unrelated regions.

## Requests pilot

Cereri de oferta is the first pilot for this architecture.

Its implementation should:
1. consume existing global tokens where valid;
2. add missing generic tokens only when genuinely cross-product;
3. create `src/styles/surfaces/requests.css` for request-specific styling;
4. extract a primitive only when Cereri demonstrates a pattern that is clearly reusable;
5. keep responsive rules for Cereri with the Cereri surface styles;
6. support both dark and light through token/theme roles;
7. avoid growing `ui.css` except for a narrow compatibility change if proven necessary.

## CSS naming and selector discipline

Prefer:
- one surface namespace;
- shallow selectors;
- class-based styling;
- data attributes for real state/layout/theme variants;
- semantic token variables.

Avoid:
- deeply nested descendant selectors;
- tag-dependent styling for complex controls;
- `!important` except a documented compatibility escape hatch;
- selectors that depend on accidental DOM order;
- page styles that override another page globally;
- arbitrary pixel duplication when an existing token fits.

## Responsive ownership

Responsive behavior belongs with the surface/component that owns the layout.

Do not create one giant global responsive file containing feature-specific overrides.

Shared breakpoints may be tokenized/documented, but the request page owns its own progressive-detail decisions.

The WorkOS responsive principle is:

```text
REDUCE SECONDARY DETAIL BEFORE SHRINKING PRIMARY FUNCTION INTO ILLEGIBILITY
```

## Dark/light ownership

A surface must be designed for both themes from the start.

Do not complete dark and then mechanically invert it.

Shared geometry and hierarchy remain stable.
Theme changes recalibrate:
- surface values;
- ink;
- borders;
- grid/line visibility;
- active/inactive contrast;
- functional emission.

No major surface is accepted until both dark and light are visually reviewed.

## Testing and review

For substantial UI work:
- deterministic component tests where behavior changes;
- build/typecheck as appropriate;
- browser/runtime proof;
- relevant desktop/tablet/phone viewports;
- dark/light;
- interaction states;
- screenshot sets stored with a task-specific folder + common prefix.

Screenshot naming contract:

```text
<TASK_PREFIX>__01_<STATE>_<VIEWPORT>.png
<TASK_PREFIX>__02_<STATE>_<VIEWPORT>.png
...
```

Each review set gets its own folder.

## Migration strategy

```text
NEW SURFACE
-> new modular owner

EXISTING SURFACE TOUCHED NARROWLY
-> fix in current owner

EXISTING SURFACE MATERIALLY REDESIGNED
-> migrate touched styling deliberately

WHOLE ui.css REWRITE
-> NO
```

The objective is lower coupling and clearer ownership, not file-count purity.

## Dependency boundary

This architecture does not introduce a new component library or styling framework.

Do not add Tailwind, shadcn, 21st.dev, CSS-in-JS, or another design system merely to solve stylesheet organization.

A later dependency decision requires its own explicit Owner GO.

## Relationship to visual canon

Styling architecture is implementation structure.

Visual character is defined by:
`docs/architecture/WORKOS_VISUAL_LANGUAGE_CANON_V1.md`.

The architecture must make that character easier to evolve consistently without turning one file into the entire product.
