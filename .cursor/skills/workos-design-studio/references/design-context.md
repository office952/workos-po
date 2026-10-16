# Design context

WorkOS is **not** a generic SaaS dashboard.

This file explains who the product serves and the environment of use. It references existing WorkOS authority. It does not fork it.

## Who it serves

Primary users include:

- operators
- production managers
- administrators
- commercial users

They work on real production business, across office and workshop, with frequent interruption, technical information, and operational pressure.

## Desired product character

Judge clarity for the person doing the work. Current policy is `docs/architecture/WORKOS_UIUX_AUTHORITY_CURRENT.md`.

`CALM INSTRUMENT`, industrial-hardware identity, and a mandatory Azure action color are retired. Do not use them as design constraints.

## Orientation every normal page must answer

- where am I
- what object am I dealing with
- what state is it in
- what should I do next
- what happens if I act

If a composition cannot answer those, it is unfinished — even if it looks tidy.

## Environment consequences

Design for scanning under interruption, not for decorative browsing.

- Prefer a readable current object and next action over a marketing hero.
- Technical values must stay precise; presentation may not invent, round away, or hide Product Truth.
- Workshop and office share one product language. Density may change with page job; character must not.

## What Design Studio must not absorb

Do not treat the following as design source unless the task actually depends on them:

- CI, packaging, security tooling, release procedure
- Git history
- backend implementation detail
- runtime screenshots as a permanent visual canon (they are evidence of behavior)

## Authority pointers

Read these. Do not rewrite them.

- Product / repository identity: `AGENTS.md`, `docs/SOURCE_OF_TRUTH.md`
- Presentation vs engine: `docs/ARCHITECTURE.md`
- Living program: `docs/ROADMAP.md`
- UI/UX policy: `docs/architecture/WORKOS_UIUX_AUTHORITY_CURRENT.md`
- Changeable business truth: `docs/architecture/WORKOS_CONFIGURATION_FIRST_CANON.md`

```text
WORKOS PO API → typed transport → adapter → presentation → UI
```

Never: UI → duplicated business calculation.
