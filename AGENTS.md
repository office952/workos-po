# WorkOS PO agent contract

## Repository identity

This repository is:

`office952/workos-po`

If the working repository is not exactly that:

**STOP.**

Do not continue implementation, commit, or push until the working tree is the WorkOS PO repository.

## Presentation baseline

The initial frontend tree was seeded from:

```text
PRESENTATION_BASE_REPOSITORY = office952/workos-ui20
PRESENTATION_BASE_HEAD = 9446b6d7b2b4e6b7c8ff829de97c1a583c712366
```

Do not silently fast-forward that baseline to a later UI20 commit.
Do not import WorkOS Final `apps/web` presentation.
Do not use Pass A reconstruction as the frontend source.

## Hard boundary

The preserved root frontend is the only UI. Do not import Final `apps/web`.

`office952/workos-final` remains the pinned business-engine source. The imported `@workos-final/api` and `@workos-final/domain` packages must stay semantically identical to that pin unless a later Owner GO authorizes engine change.

Never commit WorkOS PO work to `workos-final` or `workos-ui20`.

Never modify `workos-final` from this repository.

```text
workos-final != workos-po
workos-ui20 != workos-po
```

## Forbidden duplication

Never copy or independently implement:

- pricing formulas
- technical formulas
- ProductDefinition
- Product Truth
- Quote engine
- Order engine
- Production Release engine
- execution state machine
- eligibility logic
- business readiness logic
- database schema

## Integration rule

Preferred relationship for this wave:

```text
WORKOS FINAL API
→ typed transport contract
→ adapter
→ presentation model
→ UI
```

Never:

```text
UI → duplicated business calculation
```

UI may code experience: layout, reusable components, interaction, responsive behavior, generic renderers.

UI must not hardcode business truth: product fields, materials, formulas, pricing, costs, readiness, dependencies, module activation, business statuses, totals, commercial flows, or Product Truth.

## Language

- Operator-facing UI: Romanian
- Code / internal identifiers: English permitted

Normal operator UI does not expose internal jargon: hashes, DTO names, raw codes, service names, compiler vocabulary, raw provenance, debug objects, or internal JSON.

## Owner gates

No production deployment, real Cloud mutation, business DB mutation, old-repo mutation, or cutover without an explicit Owner GO.

No business database, ORM, migrations, seeds, or destructive data operations without an explicit Owner GO.
