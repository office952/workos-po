# WorkOS UI/UX authority — current

Status: **OWNER-ACCEPTED** (2026-10-16). Applies to `office952/workos-po`, including N-009.

This document is the current UI/UX policy. It supersedes earlier claims that a Figma file, a visual-identity canon, or a fixed palette is the authority for new presentation work.

## What remains authoritative

Product and business truth stay in the engine:

```text
BUSINESS_ENGINE_AUTHORITY = workos-po/apps/api + workos-po/packages/domain
PERSISTENCE_IMPLEMENTATION_AUTHORITY = workos-po/apps/api
PRESENTATION_IMPLEMENTATION = workos-po root frontend
```

The interface does not invent readiness, formulas, quantities, stock, statuses, eligibility, or permissions.

UI/UX decisions come from:

1. the operator's real task and the problem in front of them;
2. a critical look at alternatives;
3. an explicit Owner decision, recorded in the repository and in Notion;
4. implementation in this application;
5. verification in the running product, on a synthetic runtime unless a later GO says otherwise;
6. Owner acceptance of the direction.

The existing frontend is the place work starts. It is evidence of what the product does today. It is not an aesthetic standard that must be copied when it gets in the way of the task.

## Retired as current authority

Do not treat these as current gates, fidelity sources, or immutable design rules:

- the Figma file `WorkOs-F` and its protected nodes;
- any other historical Figma file;
- `CALM INSTRUMENT`;
- `INDUSTRIAL HARDWARE / FUTURE INTELLIGENCE`;
- the 70/30 industrial-to-future ratio;
- mandatory grey/blue palettes;
- a rule that Azure is required for actions.

Those materials stay in the repository as provenance. Do not delete their history, and do not appoint another Figma file in their place. Reinstating a Figma authority requires a separate Owner GO.

Historical records:

- `docs/FIGMA_AUTHORITY.md` — **RETIRED / HISTORICAL ONLY**
- `docs/architecture/WORKOS_VISUAL_LANGUAGE_CANON_V1.md` — **SUPERSEDED**

## Structural rules that stay

- one SaaS product, one business engine, one Product Truth;
- modular stylesheets, owned by the surface that uses them (`docs/architecture/WORKOS_UI_STYLE_ARCHITECTURE_V1.md`);
- no new major surface should add bulk to `src/styles/ui.css`;
- no replacement component library or styling framework without an explicit Owner GO;
- Romanian for operator-facing copy; no internal jargon in normal UI;
- accessibility, visible focus, keyboard use, and responsive layout;
- traceable actions: who acted, when, and what the system actually saved;
- browser evidence shows behavior. It does not, by itself, become a permanent visual canon.

## How to change the interface

Prefer a local change that makes the current task clearer. A broader redesign is a separate proposal for an Owner decision. Do not turn an authority reset into a global restyle.
